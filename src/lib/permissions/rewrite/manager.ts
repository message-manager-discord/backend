import { PrismaClient, Prisma } from "@prisma/client";
import { Snowflake } from "discord-api-types/globals";
import { FastifyInstance } from "fastify";
import { GuildManager } from "redis-discord-cache";
import { Permissions } from "../../../consts";
import { AllInternalPermissions, InternalPermissions } from "./consts";
import {
  ChannelPermissionData,
  GuildPermissionData,
  PermissionAllowAndDenyData,
} from "./types";

const checkDiscordPermissionValue = (
  existingPermission: bigint,
  permission: bigint
): boolean => {
  const adminPerm =
    (existingPermission & Permissions.ADMINISTRATOR) ===
    Permissions.ADMINISTRATOR;
  const otherPerm = (existingPermission & permission) === permission;

  return adminPerm || otherPerm;
};

class PermissionManager {
  private _prisma: PrismaClient;
  private _guildManagerCache: GuildManager;
  private _instance: FastifyInstance;
  constructor(instance: FastifyInstance) {
    this._instance = instance;
    this._prisma = instance.prisma;
    this._guildManagerCache = instance.redisGuildManager;
  }

  private async getAllGuildPermissions(
    guildId: Snowflake
  ): Promise<GuildPermissionData | null> {
    const guild = await this._prisma.guild.findUnique({
      where: { id: BigInt(guildId) },
      select: { permissions: true },
    });
    if (!guild || !guild.permissions) return null;
    return guild.permissions as unknown as GuildPermissionData;
  }

  private async getAllChannelPermissions(
    channelId: Snowflake
  ): Promise<ChannelPermissionData | null> {
    const channel = await this._prisma.channel.findUnique({
      where: { id: BigInt(channelId) },
      select: { permissions: true },
    });
    if (!channel || !channel.permissions) return null;
    return channel.permissions as unknown as ChannelPermissionData;
  }

  // Calculate the guild permissions for a user
  private async _calculateGuildPermissions(
    userId: Snowflake,
    userRoles: Snowflake[],
    guildId: Snowflake
  ): Promise<number> {
    // This doesn't include a check for discord administrator permission, as that should only be done once (in the case of calculating channel permissions)
    // Then get the OR'd sum of the user's role permissions
    const guildPermissions = await this.getAllGuildPermissions(guildId);
    if (!guildPermissions) return InternalPermissions.NONE;
    const userRolePermissions = userRoles.reduce(
      (permissions: number, roleId: Snowflake) => {
        const rolePermissions = guildPermissions.roles[roleId];
        if (!rolePermissions) return permissions;
        return permissions | rolePermissions;
      },
      InternalPermissions.NONE
    );
    const userPermissionData = guildPermissions.users[userId];

    // The user's permissions are the role permissions, not including the deny permissions, and then the allow permissions
    let total = userRolePermissions;
    if (userPermissionData) {
      if (userPermissionData.deny) {
        total &= ~userPermissionData.deny;
      }
      if (userPermissionData.allow) {
        total |= userPermissionData.allow;
      }
    }
    return total;
  }

  // Public function that includes a check for discord administrator permission
  public async getGuildPermissions(
    userId: Snowflake,
    userRoles: Snowflake[],
    guildId: Snowflake
  ): Promise<number> {
    // First check if the user is a discord administrator
    const cachedGuild = this._guildManagerCache.getGuild(guildId);
    const userPermissions = await cachedGuild.calculateGuildPermissions(
      userId,
      userRoles
    );
    if (
      checkDiscordPermissionValue(userPermissions, Permissions.ADMINISTRATOR)
    ) {
      return AllInternalPermissions;
    }
    return this._calculateGuildPermissions(userId, userRoles, guildId);
  }

  // Public function to get channel permissions for a user, includes a check for discord administrator permission
  // A note on threads, they inherit permissions from the parent channel, so channelIds passed should not be a thread, but the parent channel
  public async getChannelPermissions(
    userId: Snowflake,
    userRoles: Snowflake[],
    guildId: Snowflake,
    channelId: Snowflake
  ): Promise<number> {
    // First check if the user is a discord administrator
    const cachedGuild = this._guildManagerCache.getGuild(guildId);
    const userPermissions = await cachedGuild.calculateGuildPermissions(
      userId,
      userRoles
    );
    if (
      checkDiscordPermissionValue(userPermissions, Permissions.ADMINISTRATOR)
    ) {
      return AllInternalPermissions;
    }
    const guildPermissions = await this._calculateGuildPermissions(
      userId,
      userRoles,
      guildId
    );
    let total = guildPermissions;

    const channelPermissions = await this.getAllChannelPermissions(channelId);
    if (!channelPermissions) {
      return guildPermissions;
    }
    // Next is the allow / deny sums for channel role overrides
    const channelRoleDenyPermissions = userRoles.reduce(
      (permissions: number, roleId: Snowflake) => {
        const rolePermissions = channelPermissions.roles[roleId];
        if (!rolePermissions || !rolePermissions.deny) return permissions;
        return permissions | rolePermissions.deny;
      },
      InternalPermissions.NONE
    );
    const channelRoleAllowPermissions = userRoles.reduce(
      (permissions: number, roleId: Snowflake) => {
        const rolePermissions = channelPermissions.roles[roleId];
        if (!rolePermissions || !rolePermissions.allow) return permissions;
        return permissions | rolePermissions.allow;
      },
      InternalPermissions.NONE
    );
    total &= ~channelRoleDenyPermissions;
    total |= channelRoleAllowPermissions;
    // And then finally user deny, allow overrides
    const userPermissionData = channelPermissions.users[userId];
    if (userPermissionData) {
      if (userPermissionData.deny) {
        total &= ~userPermissionData.deny;
      }
      if (userPermissionData.allow) {
        total |= userPermissionData.allow;
      }
    }
    return total;
  }

  private _hasPermission(userPermission: number, permission: number): boolean {
    return (userPermission & permission) === permission;
  }

  public async hasPermission(
    userId: Snowflake,
    userRoles: Snowflake[],
    guildId: Snowflake,
    permission: number,
    channelId?: Snowflake
  ): Promise<boolean> {
    if (channelId) {
      const channelPermissions = await this.getChannelPermissions(
        userId,
        userRoles,
        guildId,
        channelId
      );
      return this._hasPermission(channelPermissions, permission);
    } else {
      const guildPermissions = await this.getGuildPermissions(
        userId,
        userRoles,
        guildId
      );
      return this._hasPermission(guildPermissions, permission);
    }
  }
  // These functions deal with the management of permissions

  private async _setAllGuildPermissions({
    guildId,
    permissions,
  }: {
    guildId: Snowflake;
    permissions: GuildPermissionData;
  }): Promise<void> {
    await this._prisma.guild.upsert({
      where: { id: BigInt(guildId) },
      update: { permissions: permissions as unknown as Prisma.JsonObject },
      create: {
        id: BigInt(guildId),
        permissions: permissions as unknown as Prisma.JsonObject,
      },
    });
  }

  private async _setAllChannelPermissions({
    channelId,
    permissions,
    guildId,
  }: {
    channelId: Snowflake;
    permissions: ChannelPermissionData;
    guildId: Snowflake;
  }): Promise<void> {
    await this._prisma.channel.upsert({
      where: { id: BigInt(channelId) },
      update: { permissions: permissions as unknown as Prisma.JsonObject },
      create: {
        id: BigInt(channelId),
        permissions: permissions as unknown as Prisma.JsonObject,
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
  }

  // These parsing functions will ensure that the permission data is in it's full state
  private _parseAndFixBasePermissionData(
    permissions: GuildPermissionData | null
  ): GuildPermissionData;
  private _parseAndFixBasePermissionData(
    permissions: ChannelPermissionData | null
  ): ChannelPermissionData;
  private _parseAndFixBasePermissionData(
    permissions: GuildPermissionData | ChannelPermissionData | null
  ): GuildPermissionData | ChannelPermissionData;
  private _parseAndFixBasePermissionData(
    permissions: GuildPermissionData | ChannelPermissionData | null
  ): GuildPermissionData | ChannelPermissionData {
    if (!permissions) {
      return {
        roles: {},
        users: {},
      };
    }
    return permissions;
  }

  private _parseAndFixGuildRolePermissionData(
    permissions: GuildPermissionData | null,
    roleId: Snowflake
  ): GuildPermissionData {
    const fixedPermissions = this._parseAndFixBasePermissionData(permissions);
    if (!fixedPermissions.roles) {
      fixedPermissions.roles = {};
    }
    if (!fixedPermissions.roles[roleId]) {
      fixedPermissions.roles[roleId] = InternalPermissions.NONE;
    }
    return fixedPermissions;
  }
  private _parseAndFixChannelRolePermissionData(
    permissions: ChannelPermissionData | null,
    roleId: Snowflake
  ): ChannelPermissionData {
    const fixedPermissions = this._parseAndFixBasePermissionData(permissions);
    if (!fixedPermissions.roles) {
      fixedPermissions.roles = {};
    }
    if (!fixedPermissions.roles[roleId]) {
      fixedPermissions.roles[roleId] = {
        allow: InternalPermissions.NONE,
        deny: InternalPermissions.NONE,
      };
    }
    if (!fixedPermissions.roles[roleId].allow) {
      fixedPermissions.roles[roleId].allow = InternalPermissions.NONE;
    }
    if (!fixedPermissions.roles[roleId].deny) {
      fixedPermissions.roles[roleId].deny = InternalPermissions.NONE;
    }

    return fixedPermissions;
  }

  // This can be an override because the format for user permissions is the same on both, and the role data is not touched

  private _parseAndFixUserPermissionData(
    permissions: GuildPermissionData | null,
    userId: Snowflake
  ): GuildPermissionData;
  private _parseAndFixUserPermissionData(
    permissions: ChannelPermissionData | null,
    userId: Snowflake
  ): ChannelPermissionData;
  private _parseAndFixUserPermissionData(
    permissions: GuildPermissionData | ChannelPermissionData | null,
    userId: Snowflake
  ): GuildPermissionData | ChannelPermissionData {
    const fixedPermissions = this._parseAndFixBasePermissionData(permissions);
    if (!fixedPermissions.users) {
      fixedPermissions.users = {};
    }
    if (!fixedPermissions.users[userId]) {
      fixedPermissions.users[userId] = {
        allow: InternalPermissions.NONE,
        deny: InternalPermissions.NONE,
      };
    }
    if (!fixedPermissions.users[userId].allow) {
      fixedPermissions.users[userId].allow = InternalPermissions.NONE;
    }
    if (!fixedPermissions.users[userId].deny) {
      fixedPermissions.users[userId].deny = InternalPermissions.NONE;
    }
    return fixedPermissions;
  }

  // This function will set a role's permission on a guild level
  private async _setRolePermission({
    roleId,
    guildId,
    permission,
  }: {
    roleId: Snowflake;
    guildId: Snowflake;
    permission: number;
  }): Promise<void> {
    let existingGuildPermissions = await this.getAllGuildPermissions(guildId);

    // Ensure the permission data is setup correctly
    existingGuildPermissions = this._parseAndFixGuildRolePermissionData(
      existingGuildPermissions,
      roleId
    );
    existingGuildPermissions.roles[roleId] = permission;
    await this._setAllGuildPermissions({
      guildId,
      permissions: existingGuildPermissions,
    });
  }

  // This function will set a user's permission overrides on a guild level
  // If the allow, or deny parameters are not passed they are unchanged
  private async _setUserPermission({
    userId,
    guildId,
    allow,
    deny,
  }: {
    userId: Snowflake;
    guildId: Snowflake;
    allow?: number;
    deny?: number;
  }): Promise<void> {
    let existingGuildPermissions = await this.getAllGuildPermissions(guildId);

    // Ensure the permission data is setup correctly
    existingGuildPermissions = this._parseAndFixUserPermissionData(
      existingGuildPermissions,
      userId
    );
    // Set the allow and deny values
    if (allow) {
      existingGuildPermissions.users[userId].allow = allow;
    }
    if (deny) {
      existingGuildPermissions.users[userId].deny = deny;
    }
    await this._setAllGuildPermissions({
      guildId,
      permissions: existingGuildPermissions,
    });
  }

  // This function will set a roles's permission overrides on a channel level
  // If the allow, or deny parameters are not passed they are unchanged
  private async _setChannelRolePermission({
    channelId,
    guildId,
    roleId,
    allow,
    deny,
  }: {
    channelId: Snowflake;
    guildId: Snowflake;
    roleId: Snowflake;
    allow?: number;
    deny?: number;
  }): Promise<void> {
    let existingChannelPermissions = await this.getAllChannelPermissions(
      channelId
    );

    // Ensure the permission data is setup correctly
    existingChannelPermissions = this._parseAndFixChannelRolePermissionData(
      existingChannelPermissions,
      roleId
    );
    // Set the allow and deny values
    if (allow) {
      existingChannelPermissions.roles[roleId].allow = allow;
    }
    if (deny) {
      existingChannelPermissions.roles[roleId].deny = deny;
    }

    await this._setAllChannelPermissions({
      channelId,
      permissions: existingChannelPermissions,
      guildId,
    });
  }

  // This function will set a user's permission overrides on a channel level
  // If the allow, or deny parameters are not passed they are unchanged
  private async _setChannelUserPermission({
    channelId,
    guildId,
    userId,
    allow,
    deny,
  }: {
    channelId: Snowflake;
    guildId: Snowflake;
    userId: Snowflake;
    allow?: number;
    deny?: number;
  }): Promise<void> {
    let existingChannelPermissions = await this.getAllChannelPermissions(
      channelId
    );

    // Ensure the permission data is setup correctly
    existingChannelPermissions = this._parseAndFixUserPermissionData(
      existingChannelPermissions,
      userId
    );
    // Set the allow and deny values
    if (allow) {
      existingChannelPermissions.users[userId].allow = allow;
    }
    if (deny) {
      existingChannelPermissions.users[userId].deny = deny;
    }
    await this._setAllChannelPermissions({
      channelId,
      permissions: existingChannelPermissions,
      guildId,
    });
  }

  private _getRolePermissionFromPotentiallyUndefinedData(
    permissions: GuildPermissionData | null,
    roleId: Snowflake
  ): number {
    if (!permissions || !permissions.roles || !permissions.roles[roleId]) {
      return InternalPermissions.NONE;
    } else {
      return permissions.roles[roleId];
    }
  }

  // This function will allow a permission for a role. It returns the resulting permission
  public async allowRolePermission({
    roleId,
    permission,
    guildId,
  }: {
    roleId: Snowflake;
    permission: number;
    guildId: Snowflake;
  }): Promise<number> {
    const guildPermissions = await this.getAllGuildPermissions(guildId);
    let existingPermission =
      this._getRolePermissionFromPotentiallyUndefinedData(
        guildPermissions,
        roleId
      );
    existingPermission |= permission;
    await this._setRolePermission({
      roleId,
      guildId,
      permission: existingPermission,
    });
    return existingPermission;
  }

  // This function will remove a permission for a role. It returns the resulting permission
  public async removeRolePermission({
    roleId,
    permission,
    guildId,
  }: {
    roleId: Snowflake;
    permission: number;
    guildId: Snowflake;
  }): Promise<number> {
    const guildPermissions = await this.getAllGuildPermissions(guildId);
    let existingPermission =
      this._getRolePermissionFromPotentiallyUndefinedData(
        guildPermissions,
        roleId
      );
    existingPermission &= ~permission;
    await this._setRolePermission({
      roleId,
      guildId,
      permission: existingPermission,
    });
    return existingPermission;
  }

  private _getAllowAndDenyUserPermissions({
    permissions,
    userId,
  }: {
    permissions: GuildPermissionData | ChannelPermissionData | null;
    userId: Snowflake;
  }): PermissionAllowAndDenyData {
    let existingAllow: number;
    let existingDeny: number;
    if (!permissions || !permissions.users || !permissions.users[userId]) {
      existingAllow = InternalPermissions.NONE;
      existingDeny = InternalPermissions.NONE;
    } else {
      existingAllow = permissions.users[userId].allow;
      existingDeny = permissions.users[userId].deny;
    }
    return {
      allow: existingAllow,
      deny: existingDeny,
    };
  }

  // This function will allow a permission for a user.
  // It will also remove said permission from the user deny bitfield, if it is in the deny bitfield
  // As that would then have no effect
  public async allowUserPermission({
    userId,
    permission,
    guildId,
  }: {
    userId: Snowflake;
    permission: number;
    guildId: Snowflake;
  }): Promise<PermissionAllowAndDenyData> {
    const guildPermissions = await this.getAllGuildPermissions(guildId);
    // Get existing allow and deny for the user
    let { allow, deny } = this._getAllowAndDenyUserPermissions({
      permissions: guildPermissions,
      userId,
    });

    // Add the permission to the allow bitfield
    allow |= permission;
    // Remove the permission from the deny bitfield
    deny &= ~permission;
    // Set the new permissions
    await this._setUserPermission({
      userId,
      guildId,
      allow,
      deny,
    });
    return {
      allow,
      deny,
    };
  }

  // This function will "reset" a permission for a user. That means it is not present in either the user's allow or deny bitfields
  // It will then return the resulting permissions
  public async resetUserPermission({
    userId,
    permission,
    guildId,
  }: {
    userId: Snowflake;
    permission: number;
    guildId: Snowflake;
  }): Promise<PermissionAllowAndDenyData> {
    const guildPermissions = await this.getAllGuildPermissions(guildId);
    // Get existing allow and deny for the user
    let { allow, deny } = this._getAllowAndDenyUserPermissions({
      permissions: guildPermissions,
      userId,
    });
    // Remove the permission from the allow bitfield
    allow &= ~permission;
    // Remove the permission from the deny bitfield
    deny &= ~permission;
    // Set the new permissions
    await this._setUserPermission({
      userId,
      guildId,
      allow: allow,
      deny: deny,
    });
    return {
      allow: allow,
      deny: deny,
    };
  }

  // This function will deny a permission for a user.
  // It will also remove said permission from the user allow bitfield, if it is in the allow bitfield
  // It returns the resulting permission
  public async denyUserPermission({
    userId,
    permission,
    guildId,
  }: {
    userId: Snowflake;
    permission: number;
    guildId: Snowflake;
  }): Promise<PermissionAllowAndDenyData> {
    const guildPermissions = await this.getAllGuildPermissions(guildId);
    // Get existing allow and deny for the user
    let { allow, deny } = this._getAllowAndDenyUserPermissions({
      permissions: guildPermissions,
      userId,
    });
    // Remove the permission from the allow bitfield
    allow &= ~permission;
    // Add the permission to the deny bitfield
    deny |= permission;
    // Set the new permissions
    await this._setUserPermission({
      userId,
      guildId,
      allow,
      deny,
    });
    return {
      allow: allow,
      deny: deny,
    };
  }

  private _getAllowAndDenyRoleChannelPermissions({
    permissions,
    roleId,
  }: {
    permissions: ChannelPermissionData | null;
    roleId: Snowflake;
  }): PermissionAllowAndDenyData {
    let existingAllow: number;
    let existingDeny: number;
    if (!permissions || !permissions.roles || !permissions.roles[roleId]) {
      existingAllow = InternalPermissions.NONE;
      existingDeny = InternalPermissions.NONE;
    } else {
      existingAllow = permissions.roles[roleId].allow;
      existingDeny = permissions.roles[roleId].deny;
    }
    return {
      allow: existingAllow,
      deny: existingDeny,
    };
  }

  // This function will allow a permission for a role on a channel overwrite level.
  // It will also remove said permission from the role channel deny bitfield, if it is in the deny bitfield
  // It returns the resulting permission
  public async allowChannelRolePermission({
    roleId,
    permission,
    channelId,
    guildId,
  }: {
    roleId: Snowflake;
    permission: number;
    channelId: Snowflake;
    guildId: Snowflake;
  }): Promise<PermissionAllowAndDenyData> {
    const channelPermissions = await this.getAllChannelPermissions(channelId);
    // Get existing allow and deny for the user
    let { allow, deny } = this._getAllowAndDenyRoleChannelPermissions({
      permissions: channelPermissions,
      roleId,
    });
    // Add the permission to the allow bitfield
    allow |= permission;
    // Remove the permission from the deny bitfield
    deny &= ~permission;
    // Set the new permissions
    await this._setChannelRolePermission({
      roleId,
      channelId,
      guildId,
      allow,
      deny,
    });
    return {
      allow: allow,
      deny: deny,
    };
  }

  // This function will "reset" a permission for a role on a channel overwrite level
  // That means it is not present in either the role's allow or deny bitfields
  // It will then return the resulting permissions
  public async resetChannelRolePermission({
    roleId,
    permission,
    channelId,
    guildId,
  }: {
    roleId: Snowflake;
    permission: number;
    channelId: Snowflake;
    guildId: Snowflake;
  }): Promise<PermissionAllowAndDenyData> {
    const channelPermissions = await this.getAllChannelPermissions(channelId);
    // Get existing allow and deny for the user
    let { allow, deny } = this._getAllowAndDenyRoleChannelPermissions({
      permissions: channelPermissions,
      roleId,
    });
    // Remove the permission from the allow bitfield
    allow &= ~permission;
    // Remove the permission from the deny bitfield
    deny &= ~permission;
    // Set the new permissions
    await this._setChannelRolePermission({
      roleId,
      channelId,
      guildId,
      allow,
      deny,
    });
    return {
      allow: allow,
      deny: deny,
    };
  }

  // This function will deny a permission for a role on a channel overwrite level.
  // It will also remove said permission from the role channel allow bitfield, if it is in the allow bitfield
  // It returns the resulting permission
  public async denyChannelRolePermission({
    roleId,
    permission,
    channelId,
    guildId,
  }: {
    roleId: Snowflake;
    permission: number;
    channelId: Snowflake;
    guildId: Snowflake;
  }): Promise<PermissionAllowAndDenyData> {
    const channelPermissions = await this.getAllChannelPermissions(channelId);
    // Get existing allow and deny for the user
    let { allow, deny } = this._getAllowAndDenyRoleChannelPermissions({
      permissions: channelPermissions,
      roleId,
    });
    // Remove the permission from the allow bitfield
    allow &= ~permission;
    // Add the permission to the deny bitfield
    deny |= permission;
    // Set the new permissions
    await this._setChannelRolePermission({
      roleId,
      channelId,
      guildId,
      allow,
      deny,
    });
    return {
      allow: allow,
      deny: deny,
    };
  }

  // This function will allow a permission for a user on a channel overwrite level.
  // It will also remove said permission from the user channel deny bitfield, if it is in the deny bitfield
  // It returns the resulting permission
  public async allowChannelUserPermission({
    userId,
    permission,
    channelId,
    guildId,
  }: {
    userId: Snowflake;
    permission: number;
    channelId: Snowflake;
    guildId: Snowflake;
  }): Promise<PermissionAllowAndDenyData> {
    const channelPermissions = await this.getAllChannelPermissions(channelId);
    // Get existing allow and deny for the user
    let { allow, deny } = this._getAllowAndDenyUserPermissions({
      permissions: channelPermissions,
      userId,
    });
    // Add the permission to the allow bitfield
    allow |= permission;
    // Remove the permission from the deny bitfield
    deny &= ~permission;
    // Set the new permissions
    await this._setChannelUserPermission({
      userId,
      channelId,
      guildId,
      allow,
      deny,
    });
    return {
      allow: allow,
      deny: deny,
    };
  }

  // This function will "reset" a permission for a user on a channel overwrite level
  // That means it is not present in either the user's allow or deny bitfields
  // It will then return the resulting permissions
  public async resetChannelUserPermission({
    userId,
    permission,
    channelId,
    guildId,
  }: {
    userId: Snowflake;
    permission: number;
    channelId: Snowflake;
    guildId: Snowflake;
  }): Promise<PermissionAllowAndDenyData> {
    const channelPermissions = await this.getAllChannelPermissions(channelId);
    // Get existing allow and deny for the user
    let { allow, deny } = this._getAllowAndDenyUserPermissions({
      permissions: channelPermissions,
      userId,
    });
    // Remove the permission from the allow bitfield
    allow &= ~permission;
    // Remove the permission from the deny bitfield
    deny &= ~permission;
    // Set the new permissions
    await this._setChannelUserPermission({
      userId,
      channelId,
      guildId,
      allow,
      deny,
    });
    return {
      allow: allow,
      deny: deny,
    };
  }

  // This function will deny a permission for a user on a channel overwrite level.
  // It will also remove said permission from the user channel allow bitfield, if it is in the allow bitfield
  // It returns the resulting permission
  public async denyChannelUserPermission({
    userId,
    permission,
    channelId,
    guildId,
  }: {
    userId: Snowflake;
    permission: number;
    channelId: Snowflake;
    guildId: Snowflake;
  }): Promise<PermissionAllowAndDenyData> {
    const channelPermissions = await this.getAllChannelPermissions(channelId);
    // Get existing allow and deny for the user
    let { allow, deny } = this._getAllowAndDenyUserPermissions({
      permissions: channelPermissions,
      userId,
    });
    // Remove the permission from the allow bitfield
    allow &= ~permission;
    // Add the permission to the deny bitfield
    deny |= permission;
    // Set the new permissions
    await this._setChannelUserPermission({
      userId,
      channelId,
      guildId,
      allow,
      deny,
    });
    return {
      allow: allow,
      deny: deny,
    };
  }
}

export default PermissionManager;
