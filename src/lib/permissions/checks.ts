import { Snowflake } from "discord-api-types/v9";
import { Guild } from "redis-discord-cache";
import {
  ExpectedPermissionFailure,
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors";
import { checkUserDiscordPermissions } from "./discordChecks";
import { Permission, PermissionsData } from "./types";

function checkPermissions(
  roles: Snowflake[],
  userId: Snowflake,
  permissions: PermissionsData | undefined | null,
  permission: Permission
): boolean | void {
  // Will not return a boolean if permissions for the user or the user's roles are not set on that level
  if (permissions) {
    const userPermission = permissions.users?.[userId];
    if (userPermission !== undefined) {
      return userPermission >= permission;
    }
    let highestRolePermission: Permission | null = null; // null means no role permissions for the roles provided
    for (const roleId of roles) {
      const rolePermission = permissions.roles?.[roleId];
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

async function checkAllPermissions({
  roles,
  userId,
  guild,
  guildPermissions,
  channelPermissions,
  permission,
}: {
  roles: Snowflake[];
  userId: Snowflake;
  guild: Guild;
  guildPermissions: PermissionsData | undefined | null;
  channelPermissions: PermissionsData | undefined | null;
  permission: Permission;
}): Promise<boolean> {
  // Checks work by checking if the more significant permissions are present, first
  // And then if not working down the hierarchy
  // If the user does not have the permission (but it is present) on one of the levels then other levels are not checked
  // Channel permissions are more significant than guild permissions
  // User permissions are more significant than role permissions
  // The user has the permission on each level if their permission level is greater or equal to the permission getting checked
  // channel permissions

  // If user has the `ADMINISTRATOR` permission then they can do any action
  try {
    return await checkUserDiscordPermissions({
      guild,
      roles,
      userId,
      channelId: null,
      requiredPermissions: ["ADMINISTRATOR"],
    });
  } catch (e) {
    if (
      e instanceof ExpectedPermissionFailure &&
      e.status ===
        InteractionOrRequestFinalStatus.USER_MISSING_DISCORD_PERMISSION
    ) {
      // Do nothing, the user does not have the permission
    } else {
      throw e;
    }
  }
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

async function checkIfUserCanManageRolePermissions({
  guild,
  roleId,
  userRoles,
  channelId,
  userId,
  guildPermissions,
  channelPermissions,
}: {
  guild: Guild;
  roleId: Snowflake;
  userRoles: Snowflake[];
  channelId: Snowflake | null;
  guildPermissions: PermissionsData | undefined | null;
  channelPermissions: PermissionsData | undefined | null;
  userId: Snowflake;
}): Promise<boolean> {
  const userRolesAboveRole = await guild.checkIfRoleIsLowerThanUsersRole(
    roleId,
    userRoles,
    userId
  );
  const role = await guild.getRole(roleId);

  if (!role) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.ROLE_NOT_IN_CACHE,
      "Role missing from cache"
    );
  } // Check, as checkIfRoleIsLowerThanUsersRole just ignores it is the role is missing

  if (
    !(await checkAllPermissions({
      roles: userRoles,
      guild,
      userId,
      guildPermissions,
      channelPermissions: channelId ? channelPermissions : null, // Just in case channelPermissions sneaks in there somehow
      permission: Permission.MANAGE_PERMISSIONS,
    }))
  ) {
    return false;
  }
  return userRolesAboveRole;
}

export {
  Permission,
  PermissionsData,
  checkAllPermissions,
  checkIfUserCanManageRolePermissions,
};
