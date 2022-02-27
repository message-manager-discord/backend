import {
  APIGuildMember,
  ChannelType,
  RESTPostAPIChannelMessageResult,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import limits from "../limits";

import {
  checkAllPermissions,
  checkDiscordPermissions,
  Permission,
  PermissionKeys,
  PermissionsData,
} from "./permissions";
import { DiscordHTTPError } from "detritus-client-rest/lib/errors";
import { MinimalChannel } from "redis-discord-cache/dist/structures/types";
import {
  ExpectedFailure,
  ExpectedPermissionFailure,
  InteractionOrRequestFinalStatus,
  LimitHit,
  UnexpectedFailure,
} from "../errors";
import { prisma } from "@prisma/client";

const missingAccessMessage =
  "You do not have access to the bot permission for sending messages via the bot on this guild. Please contact an administrator.";

interface ThreadOptionObject {
  parentId: string;
  locked: boolean;
  type:
    | ChannelType.GuildNewsThread
    | ChannelType.GuildPublicThread
    | ChannelType.GuildPrivateThread;
}

interface CheckSendMessageOptions {
  channelId: string;
  guildId: string;
  instance: FastifyInstance;
  user: APIGuildMember;
  thread?: ThreadOptionObject;
}
interface SendMessageOptions extends CheckSendMessageOptions {
  content: string;
  tags: string[];
}

async function checkSendMessagePossible({
  channelId,
  guildId,
  instance,
  user,
  thread,
}: CheckSendMessageOptions): Promise<true> {
  // Check if the user has the correct permissions

  const idOrParentId = thread ? thread.parentId : channelId;

  const guild = await instance.prisma.guild.findUnique({
    where: { id: BigInt(guildId) },
    select: { permissions: true },
  });
  const channel = await instance.prisma.channel.findUnique({
    where: { id: BigInt(idOrParentId) },
    select: { permissions: true },
  });

  if (
    !checkAllPermissions({
      roles: user.roles,
      userId: user.user!.id,
      guildPermissions: guild?.permissions as unknown as
        | PermissionsData
        | undefined,
      channelPermissions: channel?.permissions as unknown as
        | PermissionsData
        | undefined,
      permission: Permission.SEND_MESSAGES,
    })
  ) {
    // TODO: Remove below
    const roles: Record<string, number> = {};
    user.roles.forEach((roleId) => {
      roles[roleId] = 3;
    });
    await instance.prisma.guild.create({
      data: {
        id: BigInt(guildId),
        permissions: {
          roles: roles,
          users: {},
        },
      },
    });
    throw new ExpectedPermissionFailure(
      InteractionOrRequestFinalStatus.USER_MISSING_INTERNAL_BOT_PERMISSION,
      missingAccessMessage
    );
  }
  // check channel exists and bot has access to it
  let cachedChannel: MinimalChannel | null = null;
  const cachedGuild = instance.redisGuildManager.getGuild(guildId);
  try {
    cachedChannel = await cachedGuild.getChannel(idOrParentId);
  } catch (e) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.CHANNEL_NOT_FOUND_IN_CACHE,
      "channel not found"
    );
  }
  if (!cachedChannel) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.CHANNEL_NOT_FOUND_IN_CACHE,
      "channel not found"
    );
  }

  // Check discord permissions are correct

  const requiredBotPermissions: PermissionKeys[] = [
    thread ? "SEND_MESSAGES_IN_THREADS" : "SEND_MESSAGES",
    "VIEW_CHANNEL",
    "ATTACH_FILES",
  ];
  if (thread?.locked || thread?.type === ChannelType.GuildPrivateThread) {
    requiredBotPermissions.push("MANAGE_THREADS");
  }

  const requiredUserPermissions: PermissionKeys[] = ["VIEW_CHANNEL"];
  if (thread?.locked || thread?.type === ChannelType.GuildPrivateThread) {
    requiredUserPermissions.push("MANAGE_THREADS");
  }

  await checkDiscordPermissions({
    guild: cachedGuild,
    channelId: idOrParentId, // This is used because permissions apply on the parent channel, and threads may not be cached
    userId: user.user!.id,
    roles: user.roles,
    requiredBotPermissions: requiredBotPermissions,
    requiredUserPermissions: requiredBotPermissions,
  });

  // Check we are not at the limit of messages per channel
  const messageCount = await instance.prisma.message.count({
    where: { channelId: BigInt(channelId) },
  });
  if (messageCount >= limits.MAX_MESSAGES_PER_CHANNEL) {
    throw new LimitHit(
      InteractionOrRequestFinalStatus.EXCEEDED_CHANNEL_MESSAGE_LIMIT,
      `You have reached the limit of ${limits.MAX_MESSAGES_PER_CHANNEL} messages per channel.`
    );
  }
  return true;
}

async function sendMessage({
  content,
  tags,
  channelId,
  guildId,
  instance,
  user,
}: SendMessageOptions) {
  // Permissions MUST have been checked with checkSendMessagePossible
  try {
    const messageResult = (await instance.restClient.createMessage(channelId, {
      content,
    })) as RESTPostAPIChannelMessageResult;
    await instance.prisma.message.create({
      data: {
        id: BigInt(messageResult.id),
        content: messageResult.content,

        lastEditedAt: new Date(Date.now()),
        tags,
        channel: {
          connectOrCreate: {
            where: {
              id: BigInt(channelId),
            },

            create: {
              id: BigInt(channelId),
              guildId: BigInt(guildId),
            },
          },
        },
        guild: {
          connectOrCreate: {
            where: {
              id: BigInt(guildId),
            },

            create: {
              id: BigInt(guildId),
            },
          },
        },
      },
    });
  } catch (error) {
    if (error instanceof DiscordHTTPError) {
      if (error.code === 404) {
        throw new UnexpectedFailure(
          InteractionOrRequestFinalStatus.CHANNEL_NOT_FOUND_DISCORD_HTTP,
          "Channel not found"
        );
      } else if (error.code === 403) {
        throw new UnexpectedFailure(
          InteractionOrRequestFinalStatus.MISSING_PERMISSIONS_DISCORD_HTTP_SEND_MESSAGE,
          error.message
        );
      }
      throw error;
    }
    throw error;
  }
}

export { sendMessage, checkSendMessagePossible, ThreadOptionObject };
