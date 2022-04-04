import {
  APIInteractionGuildMember,
  RESTPostAPIChannelMessageResult,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import limits from "../../limits";

import {
  checkAllPermissions,
  Permission,
  PermissionsData,
} from "../permissions/checks";
import { DiscordHTTPError } from "detritus-client-rest/lib/errors";
import {
  ExpectedPermissionFailure,
  InteractionOrRequestFinalStatus,
  LimitHit,
  UnexpectedFailure,
} from "../../errors";
import {
  checkDefaultDiscordPermissionsPresent,
  ThreadOptionObject,
} from "../permissions/discordChecks";

const missingAccessMessage =
  "You do not have access to the bot permission for sending messages via the bot on this guild. Please contact an administrator.";

interface CheckSendMessageOptions {
  channelId: string;
  guildId: string;
  instance: FastifyInstance;
  user: APIInteractionGuildMember;
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

  const { idOrParentId } = await checkDefaultDiscordPermissionsPresent({
    instance,
    user,
    guildId,
    channelId,
    thread,
  });

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
      userId: user.user.id,
      guildPermissions: guild?.permissions as unknown as
        | PermissionsData
        | undefined,
      channelPermissions: channel?.permissions as unknown as
        | PermissionsData
        | undefined,
      permission: Permission.SEND_MESSAGES,
    })
  ) {
    throw new ExpectedPermissionFailure(
      InteractionOrRequestFinalStatus.USER_MISSING_INTERNAL_BOT_PERMISSION,
      missingAccessMessage
    );
  }

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
  thread,
}: SendMessageOptions) {
  await checkSendMessagePossible({
    channelId,
    guildId,
    instance,
    user,
    thread,
  });
  try {
    const messageResult = (await instance.restClient.createMessage(channelId, {
      content,
    })) as RESTPostAPIChannelMessageResult;
    await instance.prisma.message.create({
      data: {
        id: BigInt(messageResult.id),
        content: messageResult.content,

        editedAt: new Date(Date.now()),
        editedBy: BigInt(user.user.id),
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
