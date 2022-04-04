import {
  APIInteractionGuildMember,
  ChannelType,
  Snowflake,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import { Guild } from "redis-discord-cache";
import {
  GuildThreadTypes,
  MinimalChannel,
} from "redis-discord-cache/dist/structures/types";
import { Permissions } from "../../consts";
import {
  ExpectedFailure,
  ExpectedPermissionFailure,
  InteractionOrRequestFinalStatus,
} from "../../errors";
import { getGuildChannelHandleErrors } from "../messages/utils";

function checkDiscordPermissionValue(
  existingPermission: bigint,
  permission: bigint
): boolean {
  const adminPerm =
    (existingPermission & Permissions.ADMINISTRATOR) ===
    Permissions.ADMINISTRATOR;
  const otherPerm = (existingPermission & permission) === permission;

  return adminPerm || otherPerm;
}
const missingDiscordPermissionMessage = (
  entity: string,
  permission: string,
  channelId: string | null
) =>
  `${entity} missing the required permission \`${permission}\` to perform this action ${
    channelId ? `in the channel <#${channelId}>` : ""
  }`;

const missingUserDiscordPermissionMessage = (
  permission: string,
  channelId: string | null
) => missingDiscordPermissionMessage("You are", permission, channelId);

const missingBotDiscordPermissionMessage = (
  permission: string,
  channelId: string | null
) => missingDiscordPermissionMessage("The bot is", permission, channelId);

type PermissionKeys = keyof typeof Permissions;

async function checkDiscordPermissions({
  guild,
  channelId,
  userId,
  roles,
  requiredUserPermissions,
  requiredBotPermissions,
}: {
  guild: Guild;
  channelId: Snowflake;
  userId: Snowflake;
  roles: Snowflake[];
  requiredUserPermissions: PermissionKeys[];
  requiredBotPermissions: PermissionKeys[];
}): Promise<true> {
  const permissions = await guild.calculateChannelPermissions(
    userId,
    roles,
    channelId
  );
  requiredUserPermissions.forEach((permission) => {
    if (!checkDiscordPermissionValue(permissions, Permissions[permission])) {
      throw new ExpectedPermissionFailure(
        InteractionOrRequestFinalStatus.USER_MISSING_DISCORD_PERMISSION,
        missingUserDiscordPermissionMessage(permission, channelId)
      );
    }
  });
  const permissionsBot = await guild.calculateBotChannelPermissions(channelId);

  requiredBotPermissions.forEach((permission) => {
    if (!checkDiscordPermissionValue(permissionsBot, Permissions[permission])) {
      throw new ExpectedPermissionFailure(
        InteractionOrRequestFinalStatus.BOT_MISSING_DISCORD_PERMISSION,
        missingBotDiscordPermissionMessage(permission, channelId)
      );
    }
  });
  return true;
}

interface ThreadOptionObject {
  parentId?: string | null;
  locked?: boolean;
  type:
    | ChannelType.GuildNewsThread
    | ChannelType.GuildPublicThread
    | ChannelType.GuildPrivateThread;
}

interface CheckDefaultDiscordPermissionsPresentOptions {
  user: APIInteractionGuildMember;
  instance: FastifyInstance;
  guildId: Snowflake;
  channelId: Snowflake;

  thread?: ThreadOptionObject;
}

interface CheckDefaultDiscordPermissionsPresentResult {
  idOrParentId: Snowflake;
}

async function checkDefaultDiscordPermissionsPresent({
  instance,
  user,
  guildId,
  channelId,
  thread,
}: CheckDefaultDiscordPermissionsPresentOptions): Promise<CheckDefaultDiscordPermissionsPresentResult> {
  const cachedGuild = instance.redisGuildManager.getGuild(guildId);

  // If thread is present, than the channel is a thread. However if it is not present it may or may not be a thread
  // This is because some commands (such as the action message command) do not return channel data in the interaction
  let threadParentId: string | undefined | null = thread?.parentId;
  let threadType = thread?.type;
  let threadLocked = thread?.locked;
  let threadExists = !!thread;
  if (!thread) {
    const threadChannel = await getGuildChannelHandleErrors({
      channelId,
      guild: cachedGuild,
    });

    threadExists =
      threadChannel.type === ChannelType.GuildNewsThread ||
      threadChannel.type === ChannelType.GuildPublicThread ||
      threadChannel.type === ChannelType.GuildPrivateThread;

    if (threadExists) {
      threadParentId = threadChannel.parent_id;
      threadType = threadChannel.type as GuildThreadTypes;
      threadLocked = threadChannel.locked;
    }
  }

  const idOrParentId = threadParentId ? threadParentId : channelId;

  // check channel exists and bot has access to it
  let cachedChannel: MinimalChannel | null = null;
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
  if (threadLocked || threadType === ChannelType.GuildPrivateThread) {
    requiredBotPermissions.push("MANAGE_THREADS");
  }

  const requiredUserPermissions: PermissionKeys[] = ["VIEW_CHANNEL"];
  if (threadLocked || threadType === ChannelType.GuildPrivateThread) {
    requiredUserPermissions.push("MANAGE_THREADS");
  }

  await checkDiscordPermissions({
    guild: cachedGuild,
    channelId: idOrParentId, // This is used because permissions apply on the parent channel, and threads may not be cached
    userId: user.user.id,
    roles: user.roles,
    requiredBotPermissions: requiredBotPermissions,
    requiredUserPermissions: requiredUserPermissions,
  });
  return { idOrParentId };
}

export {
  checkDiscordPermissionValue,
  checkDefaultDiscordPermissionsPresent,
  checkDiscordPermissions,
  ThreadOptionObject,
};
