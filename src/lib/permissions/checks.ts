import { Snowflake } from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import {
  ExpectedPermissionFailure,
  InteractionOrRequestFinalStatus,
} from "../../errors";
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

function checkAllPermissions({
  roles,
  userId,
  guildPermissions,
  channelPermissions,
  permission,
}: {
  roles: Snowflake[];
  userId: Snowflake;
  guildPermissions: PermissionsData | undefined | null;
  channelPermissions: PermissionsData | undefined | null;
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

function checkManagementPermission({
  managementRoles,
  userRoles,
}: {
  managementRoles?: BigInt[];
  userRoles: Snowflake[];
}): boolean {
  if (!managementRoles) {
    return false;
  }
  for (const managementRole of managementRoles) {
    if (userRoles.includes(managementRole.toString())) {
      return true;
    }
  }
  return false;
}

function checkManagementPermissionThrowIfNot({
  managementRoles,
  userRoles,
}: {
  managementRoles?: BigInt[];
  userRoles: Snowflake[];
}): true {
  if (!checkManagementPermission({ managementRoles, userRoles })) {
    throw new ExpectedPermissionFailure(
      InteractionOrRequestFinalStatus.USER_MISSING_INTERNAL_BOT_MANAGEMENT_PERMISSION,
      "You must be a bot manager (have a role assigned to be a management role) to use this command"
    );
  }
  return true;
}

async function checkManagementPermissionThrowIfNotDatabaseQuery({
  userRoles,
  guildId,
  instance,
}: {
  userRoles: Snowflake[];
  guildId: Snowflake;
  instance: FastifyInstance;
}) {
  // This is because in some cases it is more optimized to retrieve the guild separately.
  // (for example when it is being used later)
  const guild = await instance.prisma.guild.findUnique({
    where: { id: BigInt(guildId) },
    select: { managementRoleIds: true },
  });
  return checkManagementPermissionThrowIfNot({
    managementRoles: guild?.managementRoleIds,
    userRoles,
  });
}

export {
  Permission,
  PermissionsData,
  checkAllPermissions,
  checkManagementPermission,
  checkManagementPermissionThrowIfNot,
  checkManagementPermissionThrowIfNotDatabaseQuery,
};
