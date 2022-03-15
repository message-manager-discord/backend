import {
  APIGuildMember,
  APIMessage,
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
import { getGuildChannelHandleErrors } from "./utils";

enum Permission {
  NONE = 0,
  VIEW_MESSAGES,
  EDIT_MESSAGES,
  SEND_MESSAGES,
  DELETE_MESSAGES,
  MANAGE_PERMISSIONS,
}

interface PermissionsData {
  roles: Record<Snowflake, Permission>;
  users: Record<Snowflake, Permission>;
}

function checkPermissions(
  roles: Snowflake[],
  userId: Snowflake,
  permissions: PermissionsData | undefined,
  permission: Permission
): boolean | void {
  // Will not return a boolean if permissions for the user or the user's roles are not set on that level
  if (permissions) {
    const userPermission = permissions.users[userId];
    if (userPermission !== undefined) {
      return userPermission >= permission;
    }
    let highestRolePermission: Permission | null = null; // null means no role permissions for the roles provided
    for (const roleId of roles) {
      const rolePermission = permissions.roles[roleId];
      if (rolePermission !== undefined) {
        if (highestRolePermission !== null) {
          if (rolePermission >= highestRolePermission) {
            highestRolePermission = rolePermission;
          }
        } else {
          // Highest role permission isn't defined yet
          highestRolePermission = rolePermission;
        }
      }
    }
    if (highestRolePermission !== null) {
      return highestRolePermission >= permission;
    }
  }
}

function checkAllPermissions({
  roles,
  userId,
  guildPermissions,
  channelPermissions,
  permission,
}: {
  roles: Snowflake[];
  userId: Snowflake;
  guildPermissions: PermissionsData | undefined;
  channelPermissions: PermissionsData | undefined;
  permission: Permission;
}): boolean {
  // Checks work by checking if the more significant permissions are present, first
  // And then if not working down the hierarchy
  // If the user does not have the permission (but it is present) on one of the levels then other levels are not checked
  // Channel permissions are more significant than guild permissions
  // User permissions are more significant than role permissions
  // The user has the permission on each level if their permission level is greater or equal to the permission getting checked
  // channel permissions
  const channelPermissionResult = checkPermissions(
    roles,
    userId,
    channelPermissions,
    permission
  );
  // check if channelPermissionResult is a boolean
  if (channelPermissionResult !== undefined) {
    return channelPermissionResult;
  }
  // guild permissions
  const guildPermissionResult = checkPermissions(
    roles,

    userId,

    guildPermissions,
    permission
  );
  // check if guildPermissionResult is a boolean
  if (guildPermissionResult !== undefined) {
    return guildPermissionResult;
  }
  // Otherwise return false
  return false;
}

function checkDiscordPermissionValue(
  existingPermission: bigint,
  permission: bigint
): boolean {
  const adminPerm =
    (existingPermission & Permissions.ADMINISTRATOR) ===
    Permissions.ADMINISTRATOR;
  const otherPerm = (existingPermission & permission) === permission;

  return adminPerm || otherPerm;
  return (
    (existingPermission & permission) === permission ||
    (existingPermission & Permissions.ADMINISTRATOR) ===
      Permissions.ADMINISTRATOR
  );
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
  parentId: string;
  locked: boolean;
  type:
    | ChannelType.GuildNewsThread
    | ChannelType.GuildPublicThread
    | ChannelType.GuildPrivateThread;
}

interface CheckDefaultDiscordPermissionsPresentOptions {
  user: APIGuildMember;
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
      instance,
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
    userId: user.user!.id,
    roles: user.roles,
    requiredBotPermissions: requiredBotPermissions,
    requiredUserPermissions: requiredUserPermissions,
  });
  return { idOrParentId };
}

interface GetMessageActionsPossibleOptions {
  message: APIMessage;
  user: APIGuildMember;
  instance: FastifyInstance;
  guildId: Snowflake;
}

interface GetMessageActionsPossibleResult {
  view: boolean;
  edit: boolean;
  delete: boolean;
}

async function getMessageActionsPossible({
  message,
  user,
  instance,
  guildId,
}: GetMessageActionsPossibleOptions): Promise<GetMessageActionsPossibleResult> {
  // Check if the user has the correct permissions
  const channelId = message.channel_id;
  if (message.author.id !== process.env.DISCORD_CLIENT_ID!) {
    // Env exists due to checks
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MESSAGE_AUTHOR_NOT_BOT_AUTHOR,
      "That message was not sent via the bot."
    );
  }
  const { idOrParentId } = await checkDefaultDiscordPermissionsPresent({
    instance,
    user,
    guildId,
    channelId,
  });

  const guild = await instance.prisma.guild.findUnique({
    where: { id: BigInt(guildId) },
    select: { permissions: true },
  });
  const databaseChannel = await instance.prisma.channel.findUnique({
    where: { id: BigInt(idOrParentId) },
    select: { permissions: true },
  });

  const allowedData = {
    edit: checkAllPermissions({
      roles: user.roles,
      userId: user.user!.id,
      guildPermissions: guild?.permissions as unknown as
        | PermissionsData
        | undefined,
      channelPermissions: databaseChannel?.permissions as unknown as
        | PermissionsData
        | undefined,
      permission: Permission.EDIT_MESSAGES,
    }),
    delete: checkAllPermissions({
      roles: user.roles,
      userId: user.user!.id,
      guildPermissions: guild?.permissions as unknown as
        | PermissionsData
        | undefined,
      channelPermissions: databaseChannel?.permissions as unknown as
        | PermissionsData
        | undefined,
      permission: Permission.DELETE_MESSAGES,
    }),

    view: checkAllPermissions({
      roles: user.roles,
      userId: user.user!.id,
      guildPermissions: guild?.permissions as unknown as
        | PermissionsData
        | undefined,
      channelPermissions: databaseChannel?.permissions as unknown as
        | PermissionsData
        | undefined,
      permission: Permission.VIEW_MESSAGES,
    }),
  };

  const databaseMessage = await instance.prisma.message.findFirst({
    where: { id: BigInt(message.id) },
    // Don't need to worry about ordering as all we want to do is check that this message has been sent by the bot before
  });
  if (!databaseMessage) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MESSAGE_NOT_FOUND_IN_DATABASE,
      "That message was not sent via the bot!"
    );
  }

  return allowedData;
}

export {
  Permission,
  PermissionsData,
  checkAllPermissions,
  checkDiscordPermissions,
  PermissionKeys,
  getMessageActionsPossible,
  checkDefaultDiscordPermissionsPresent,
  ThreadOptionObject,
};
