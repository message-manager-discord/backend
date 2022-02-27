import { Snowflake } from "discord-api-types/v9";
import { Guild } from "redis-discord-cache";
import { Permissions } from "../consts";
import {
  ExpectedPermissionFailure,
  InteractionOrRequestFinalStatus,
} from "../errors";

enum Permission {
  NONE = 0,
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

export {
  Permission,
  PermissionsData,
  checkAllPermissions,
  checkDiscordPermissions,
  PermissionKeys,
};
