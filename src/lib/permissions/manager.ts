import { PrismaClient, Prisma } from "@prisma/client";
import { Snowflake } from "discord-api-types/globals";
import { FastifyInstance } from "fastify";
import { Guild } from "redis-discord-cache";
import { DiscordPermissions } from "../../consts";
import {
  ExpectedPermissionFailure,
  InteractionOrRequestFinalStatus,
} from "../../errors";
import { GuildSession } from "../session";
import { getParentIdIfParentIdExists } from "./channel";
import { checkIfRoleIsBelowUsersHighestRole } from "./checks";
import {
  AllInternalPermissions,
  InternalPermissions,
  parseInternalPermissionValuesToStringNames,
} from "./consts";
import {
  BotPermissionResult,
  ChannelPermissionData,
  GuildPermissionData,
  PermissionAllowAndDenyData,
} from "./types";
import { checkDiscordPermissionValue } from "./utils";

class PermissionManager {
  private _prisma: PrismaClient;
  constructor(instance: FastifyInstance) {
    this._prisma = instance.prisma;
  }

  async getAllGuildPermissions(
    guildId: Snowflake
  ): Promise<GuildPermissionData | null> {
    const guild = await this._prisma.guild.findUnique({
      where: { id: BigInt(guildId) },
      select: { permissions: true },
    });
    //Any falsy values return null
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (guild === null || !guild.permissions) return null;
    return guild.permissions as unknown as GuildPermissionData;
  }

  async getAllChannelPermissions(
    channelId: Snowflake
  ): Promise<ChannelPermissionData | null> {
    const channel = await this._prisma.channel.findUnique({
      where: { id: BigInt(channelId) },
      select: { permissions: true },
    });
    // Any falsy values return null
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!channel || !channel.permissions) return null;
    return channel.permissions as unknown as ChannelPermissionData;
  }

  // Get all channels with a guild id that has a permission set to anything more than NONE
  public async getChannelsWithPermissions(
    guildId: Snowflake
  ): Promise<Snowflake[]> {
    let channels = await this._prisma.channel.findMany({
      where: {
        guildId: BigInt(guildId),
      },
    });
    // Filter out channels that have no permissions
    channels = channels.filter((channel) => {
      // Any falsy values
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (!channel.permissions) return false;
      // Return true if at any level there is any permission set to anything other than NONE
      for (const permission of Object.values(
        (channel.permissions as unknown as ChannelPermissionData).roles
      )) {
        if (permission.allow !== InternalPermissions.NONE) return true;
        if (permission.deny !== InternalPermissions.NONE) return true;
      }
      for (const permission of Object.values(
        (channel.permissions as unknown as ChannelPermissionData).users
      )) {
        if (permission.allow !== InternalPermissions.NONE) return true;
        if (permission.deny !== InternalPermissions.NONE) return true;
      }
      return false;
    });

    return channels.map((channel) => channel.id.toString());
  }

  // Get all users / roles with permissions set
  public async getEntitiesWithPermissions(
    guildId: Snowflake
  ): Promise<{ users: Snowflake[]; roles: Snowflake[] }> {
    const guildPermissions = await this.getAllGuildPermissions(guildId);
    const permissions = this._parseAndFixBasePermissionData(guildPermissions);
    return {
      users: Object.keys(permissions.users).filter((userId) => {
        const permission = permissions.users[userId];
        return (
          permission !== undefined &&
          (permission.allow !== InternalPermissions.NONE ||
            permission.deny !== InternalPermissions.NONE)
        );
      }),
      roles: Object.keys(permissions.roles).filter((roleId) => {
        const permission = permissions.roles[roleId];
        return (
          permission !== undefined && permission !== InternalPermissions.NONE
        );
      }),
    };
  }

  // Get all users / roles with permissions set for a channel
  public async getChannelEntitiesWithPermissions(
    channelId: Snowflake
  ): Promise<{ users: Snowflake[]; roles: Snowflake[] }> {
    const channelPermissions = await this.getAllChannelPermissions(channelId);
    const permissions = this._parseAndFixBasePermissionData(channelPermissions);
    return {
      users: Object.keys(permissions.users).filter((userId) => {
        const permission = permissions.users[userId];
        return (
          permission !== undefined &&
          (permission.allow !== InternalPermissions.NONE ||
            permission.deny !== InternalPermissions.NONE)
        );
      }),
      roles: Object.keys(permissions.roles).filter((roleId) => {
        const permission = permissions.roles[roleId];
        return (
          permission !== undefined &&
          (permission.allow !== InternalPermissions.NONE ||
            permission.deny !== InternalPermissions.NONE)
        );
      }),
    };
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
    const userPermissionData = guildPermissions.users[userId] as
      | PermissionAllowAndDenyData
      | undefined;

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
    guild: Guild
  ): Promise<number> {
    // First check if the user is a discord administrator
    const userPermissions = await guild.calculateGuildPermissions(
      userId,
      userRoles
    );
    if (
      checkDiscordPermissionValue(
        userPermissions,
        DiscordPermissions.ADMINISTRATOR
      )
    ) {
      return AllInternalPermissions;
    }
    return this._calculateGuildPermissions(userId, userRoles, guild.id);
  }

  // Public function to get channel permissions for a user, includes a check for discord administrator permission
  public async getChannelPermissions(
    userId: Snowflake,
    userRoles: Snowflake[],
    guild: Guild,
    channelId: Snowflake
  ): Promise<number> {
    // First check if the user is a discord administrator

    const userPermissions = await guild.calculateGuildPermissions(
      userId,
      userRoles
    );
    if (
      checkDiscordPermissionValue(
        userPermissions,
        DiscordPermissions.ADMINISTRATOR
      )
    ) {
      return AllInternalPermissions;
    }
    const guildPermissions = await this._calculateGuildPermissions(
      userId,
      userRoles,
      guild.id
    );
    let total = guildPermissions;

    // Ensure that the channel being checked is not a thread, and if it is, check on the parent channel instead
    const channelIdOrParentId = await getParentIdIfParentIdExists(
      channelId,
      guild
    );

    const channelPermissions = await this.getAllChannelPermissions(
      channelIdOrParentId
    );
    if (!channelPermissions) {
      return guildPermissions;
    }
    // Next is the allow / deny sums for channel role overrides
    const channelRoleDenyPermissions = userRoles.reduce(
      (permissions: number, roleId: Snowflake) => {
        const rolePermissions = channelPermissions.roles[roleId] as
          | PermissionAllowAndDenyData
          | undefined;
        if (rolePermissions === undefined || !rolePermissions.deny)
          return permissions;
        return permissions | rolePermissions.deny;
      },
      InternalPermissions.NONE
    );
    const channelRoleAllowPermissions = userRoles.reduce(
      (permissions: number, roleId: Snowflake) => {
        const rolePermissions = channelPermissions.roles[roleId];
        if (rolePermissions === undefined || !rolePermissions.allow)
          return permissions;
        return permissions | rolePermissions.allow;
      },
      InternalPermissions.NONE
    );
    total &= ~channelRoleDenyPermissions;
    total |= channelRoleAllowPermissions;
    // And then finally user deny, allow overrides
    const userPermissionData = channelPermissions.users[userId] as
      | PermissionAllowAndDenyData
      | undefined;
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

  private _hasPermissions(
    userPermission: number,
    permissions: number | number[]
  ): BotPermissionResult {
    if (typeof permissions === "number") {
      if ((userPermission & permissions) === permissions) {
        return {
          allPresent: true,
          present: [permissions],
        };
      } else {
        return {
          allPresent: false,
          present: [],
          missing: [permissions],
        };
      }
    }
    // Check if all permissions in "permissions" are present in the bitfield
    const present: number[] = [];
    const missing: number[] = [];
    for (const permission of permissions) {
      if ((userPermission & permission) === permission) {
        present.push(permission);
      } else {
        missing.push(permission);
      }
    }

    if (missing.length > 0) {
      return {
        allPresent: false,
        present,
        missing,
      };
    } else {
      return {
        allPresent: true,
        present,
      };
    }
  }

  public async hasPermissions(
    userId: Snowflake,
    userRoles: Snowflake[],
    guild: Guild,
    permissions: number | number[],
    channelId?: Snowflake
  ): Promise<BotPermissionResult> {
    if (channelId !== undefined) {
      const channelPermissions = await this.getChannelPermissions(
        userId,
        userRoles,
        guild,
        channelId
      );
      return this._hasPermissions(channelPermissions, permissions);
    } else {
      const guildPermissions = await this.getGuildPermissions(
        userId,
        userRoles,
        guild
      );
      return this._hasPermissions(guildPermissions, permissions);
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
    // Could potentially be undefined
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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
    // Could potentially be undefined
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!fixedPermissions.roles) {
      fixedPermissions.roles = {};
    }
    // Could potentially be undefined
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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
    // Could potentially be undefined
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!fixedPermissions.users) {
      fixedPermissions.users = {};
    }
    // Could potentially be undefined
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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
    if (allow !== undefined) {
      existingGuildPermissions.users[userId].allow = allow;
    }
    if (deny !== undefined) {
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
    if (allow !== undefined) {
      existingChannelPermissions.roles[roleId].allow = allow;
    }
    if (deny !== undefined) {
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
    if (allow !== undefined) {
      existingChannelPermissions.users[userId].allow = allow;
    }
    if (deny !== undefined) {
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
    // Could potentially be undefined
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!permissions || !permissions.roles || !permissions.roles[roleId]) {
      return InternalPermissions.NONE;
    } else {
      return permissions.roles[roleId];
    }
  }

  private async checkPermissions({
    channelId,
    session,
    roleId,
  }: {
    channelId?: Snowflake;
    session: GuildSession;
    roleId?: Snowflake;
  }): Promise<true> {
    // Check if user has a role higher than the role being managed
    if (
      roleId !== undefined &&
      !(await checkIfRoleIsBelowUsersHighestRole({
        session,
        roleId,
      }))
    ) {
      throw new ExpectedPermissionFailure(
        InteractionOrRequestFinalStatus.USER_ROLES_NOT_HIGH_ENOUGH,
        "The role you are trying to manage permissions for is not below your highest role"
      );
    }
    const permissionResult = await session.hasBotPermissions(
      InternalPermissions.MANAGE_PERMISSIONS,
      channelId
    );
    if (!permissionResult.allPresent) {
      const parsedMissingPermissions =
        parseInternalPermissionValuesToStringNames(permissionResult.missing);
      throw new ExpectedPermissionFailure(
        InteractionOrRequestFinalStatus.USER_MISSING_INTERNAL_BOT_PERMISSION,
        `You are missing the ${parsedMissingPermissions.join(", ")} permission${
          parsedMissingPermissions.length > 1 ? "s" : ""
        }${channelId !== undefined ? ` on the channel <#${channelId}>` : ""}`
      );
    }
    return true;
  }

  public async getRolePermissions({
    roleId,
    guildId,
  }: {
    roleId: Snowflake;
    guildId: Snowflake;
  }): Promise<number> {
    const permissions = await this.getAllGuildPermissions(guildId);
    return this._getRolePermissionFromPotentiallyUndefinedData(
      permissions,
      roleId
    );
  }

  // This function will allow a permission for a role. It returns the resulting permission
  public async allowRolePermissions({
    roleId,
    permissions,
    guildId,
    session,
  }: {
    session: GuildSession;
    roleId: Snowflake;
    permissions: number[];
    guildId: Snowflake;
  }): Promise<number> {
    // Check if the user has all permissions being managed
    await this.checkPermissions({
      roleId,
      session,
    });
    const guildPermissions = await this.getAllGuildPermissions(guildId);
    let existingPermission =
      this._getRolePermissionFromPotentiallyUndefinedData(
        guildPermissions,
        roleId
      );
    for (const perm of permissions) {
      existingPermission |= perm;
    }
    if (permissions.length > 0) {
      // No point making a database call if nothing has changed
      await this._setRolePermission({
        roleId,
        guildId,
        permission: existingPermission,
      });
    }
    return existingPermission;
  }

  // This function will remove a permission for a role. It returns the resulting permission
  public async denyRolePermissions({
    roleId,
    permissions,
    guildId,
    session,
  }: {
    session: GuildSession;
    roleId: Snowflake;
    permissions: number[];
    guildId: Snowflake;
  }): Promise<number> {
    // Check if the user has all permissions being managed
    await this.checkPermissions({
      roleId,
      session,
    });
    const guildPermissions = await this.getAllGuildPermissions(guildId);
    let existingPermission =
      this._getRolePermissionFromPotentiallyUndefinedData(
        guildPermissions,
        roleId
      );
    for (const perm of permissions) {
      existingPermission &= ~perm;
    }
    if (permissions.length > 0) {
      // No point making a database call if nothing has changed
      await this._setRolePermission({
        roleId,
        guildId,
        permission: existingPermission,
      });
    }
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
    // Could potentially be undefined
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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

  public async getUserPermissions({
    userId,
    guildId,
  }: {
    userId: Snowflake;
    guildId: Snowflake;
  }): Promise<PermissionAllowAndDenyData> {
    const permissions = await this.getAllGuildPermissions(guildId);
    return this._getAllowAndDenyUserPermissions({
      permissions,
      userId,
    });
  }

  // This function will allow a permission for a user.
  // It will also remove said permission from the user deny bitfield, if it is in the deny bitfield
  // As that would then have no effect
  public async allowUserPermissions({
    userId,
    permissions,
    guildId,
    session,
  }: {
    session: GuildSession;
    userId: Snowflake;
    permissions: number[];
    guildId: Snowflake;
  }): Promise<PermissionAllowAndDenyData> {
    // Check if the user has all permissions being managed
    await this.checkPermissions({
      session,
    });
    const guildPermissions = await this.getAllGuildPermissions(guildId);
    // Get existing allow and deny for the user
    let { allow, deny } = this._getAllowAndDenyUserPermissions({
      permissions: guildPermissions,
      userId,
    });
    for (const perm of permissions) {
      // Add the permission to the allow bitfield
      allow |= perm;
      // Remove the permission from the deny bitfield
      deny &= ~perm;
    }
    if (permissions.length > 0) {
      // No point making a database call if nothing has changed
      // Set the new permissions
      await this._setUserPermission({
        userId,
        guildId,
        allow,
        deny,
      });
    }
    return {
      allow,
      deny,
    };
  }

  // This function will "reset" a permission for a user. That means it is not present in either the user's allow or deny bitfields
  // It will then return the resulting permissions
  public async resetUserPermissions({
    userId,
    permissions,
    guildId,
    session,
  }: {
    session: GuildSession;
    userId: Snowflake;
    permissions: number[];
    guildId: Snowflake;
  }): Promise<PermissionAllowAndDenyData> {
    // Check if the user has all permissions being managed
    await this.checkPermissions({
      session,
    });

    const guildPermissions = await this.getAllGuildPermissions(guildId);
    // Get existing allow and deny for the user
    let { allow, deny } = this._getAllowAndDenyUserPermissions({
      permissions: guildPermissions,
      userId,
    });
    for (const perm of permissions) {
      // Remove the permission from the allow bitfield
      allow &= ~perm;
      // Remove the permission from the deny bitfield
      deny &= ~perm;
    }
    if (permissions.length > 0) {
      // No point making a database call if nothing has changed
      // Set the new permissions
      await this._setUserPermission({
        userId,
        guildId,
        allow: allow,
        deny: deny,
      });
    }
    return {
      allow: allow,
      deny: deny,
    };
  }

  // This function will deny a permission for a user.
  // It will also remove said permission from the user allow bitfield, if it is in the allow bitfield
  // It returns the resulting permission
  public async denyUserPermissions({
    userId,
    permissions,
    guildId,
    session,
  }: {
    session: GuildSession;
    userId: Snowflake;
    permissions: number[];
    guildId: Snowflake;
  }): Promise<PermissionAllowAndDenyData> {
    // Check if the user has all permissions being managed
    await this.checkPermissions({
      session,
    });

    const guildPermissions = await this.getAllGuildPermissions(guildId);
    // Get existing allow and deny for the user
    let { allow, deny } = this._getAllowAndDenyUserPermissions({
      permissions: guildPermissions,
      userId,
    });
    for (const perm of permissions) {
      // Remove the permission from the allow bitfield
      allow &= ~perm;
      // Add the permission to the deny bitfield
      deny |= perm;
    }
    if (permissions.length > 0) {
      // No point making a database call if nothing has changed
      // Set the new permissions
      await this._setUserPermission({
        userId,
        guildId,
        allow,
        deny,
      });
    }
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
    // Could potentially be undefined
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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

  public async getChannelRolePermissions({
    roleId,
    channelId,
  }: {
    roleId: Snowflake;
    channelId: Snowflake;
  }): Promise<PermissionAllowAndDenyData> {
    const permissions = await this.getAllChannelPermissions(channelId);
    return this._getAllowAndDenyRoleChannelPermissions({
      permissions,
      roleId,
    });
  }

  // This function will allow a permission for a role on a channel overwrite level.
  // It will also remove said permission from the role channel deny bitfield, if it is in the deny bitfield
  // It returns the resulting permission
  public async allowChannelRolePermissions({
    roleId,
    permissions,
    channelId,
    guildId,
    session,
  }: {
    session: GuildSession;
    roleId: Snowflake;
    permissions: number[];
    channelId: Snowflake;
    guildId: Snowflake;
  }): Promise<PermissionAllowAndDenyData> {
    // Check if the user has all permissions being managed
    await this.checkPermissions({
      roleId,
      session,
      channelId,
    });
    const channelPermissions = await this.getAllChannelPermissions(channelId);
    // Get existing allow and deny for the user
    let { allow, deny } = this._getAllowAndDenyRoleChannelPermissions({
      permissions: channelPermissions,
      roleId,
    });
    for (const perm of permissions) {
      // Add the permission to the allow bitfield
      allow |= perm;
      // Remove the permission from the deny bitfield
      deny &= ~perm;
    }
    if (permissions.length > 0) {
      // No point making a database call if nothing has changed
      // Set the new permissions
      await this._setChannelRolePermission({
        roleId,
        channelId,
        guildId,
        allow,
        deny,
      });
    }
    return {
      allow: allow,
      deny: deny,
    };
  }

  // This function will "reset" a permission for a role on a channel overwrite level
  // That means it is not present in either the role's allow or deny bitfields
  // It will then return the resulting permissions
  public async resetChannelRolePermissions({
    roleId,
    permissions,
    channelId,
    guildId,
    session,
  }: {
    session: GuildSession;
    roleId: Snowflake;
    permissions: number[];
    channelId: Snowflake;
    guildId: Snowflake;
  }): Promise<PermissionAllowAndDenyData> {
    // Check if the user has all permissions being managed
    await this.checkPermissions({
      roleId,
      session,
      channelId,
    });

    const channelPermissions = await this.getAllChannelPermissions(channelId);
    // Get existing allow and deny for the user
    let { allow, deny } = this._getAllowAndDenyRoleChannelPermissions({
      permissions: channelPermissions,
      roleId,
    });
    for (const perm of permissions) {
      // Remove the permission from the allow bitfield
      allow &= ~perm;
      // Remove the permission from the deny bitfield
      deny &= ~perm;
    }
    if (permissions.length > 0) {
      // No point making a database call if nothing has changed
      // Set the new permissions
      await this._setChannelRolePermission({
        roleId,
        channelId,
        guildId,
        allow,
        deny,
      });
    }
    return {
      allow: allow,
      deny: deny,
    };
  }

  // This function will deny a permission for a role on a channel overwrite level.
  // It will also remove said permission from the role channel allow bitfield, if it is in the allow bitfield
  // It returns the resulting permission
  public async denyChannelRolePermissions({
    roleId,
    permissions,
    channelId,
    guildId,
    session,
  }: {
    session: GuildSession;
    roleId: Snowflake;
    permissions: number[];
    channelId: Snowflake;
    guildId: Snowflake;
  }): Promise<PermissionAllowAndDenyData> {
    // Check if the user has all permissions being managed
    await this.checkPermissions({
      roleId,
      session,
      channelId,
    });
    const channelPermissions = await this.getAllChannelPermissions(channelId);
    // Get existing allow and deny for the user
    let { allow, deny } = this._getAllowAndDenyRoleChannelPermissions({
      permissions: channelPermissions,
      roleId,
    });
    for (const perm of permissions) {
      // Remove the permission from the allow bitfield
      allow &= ~perm;
      // Add the permission to the deny bitfield
      deny |= perm;
    }
    if (permissions.length > 0) {
      // No point making a database call if nothing has changed
      // Set the new permissions
      await this._setChannelRolePermission({
        roleId,
        channelId,
        guildId,
        allow,
        deny,
      });
    }
    return {
      allow: allow,
      deny: deny,
    };
  }

  public async getChannelUserPermissions({
    userId,
    channelId,
  }: {
    userId: Snowflake;
    channelId: Snowflake;
  }): Promise<PermissionAllowAndDenyData> {
    const permissions = await this.getAllChannelPermissions(channelId);
    return this._getAllowAndDenyUserPermissions({
      permissions,
      userId,
    });
  }

  // This function will allow a permission for a user on a channel overwrite level.
  // It will also remove said permission from the user channel deny bitfield, if it is in the deny bitfield
  // It returns the resulting permission
  public async allowChannelUserPermissions({
    userId,
    permissions,
    channelId,
    guildId,
    session,
  }: {
    session: GuildSession;
    userId: Snowflake;
    permissions: number[];
    channelId: Snowflake;
    guildId: Snowflake;
  }): Promise<PermissionAllowAndDenyData> {
    // Check if the user has all permissions being managed
    await this.checkPermissions({
      session,
      channelId,
    });

    const channelPermissions = await this.getAllChannelPermissions(channelId);
    // Get existing allow and deny for the user
    let { allow, deny } = this._getAllowAndDenyUserPermissions({
      permissions: channelPermissions,
      userId,
    });
    for (const perm of permissions) {
      // Add the permission to the allow bitfield
      allow |= perm;
      // Remove the permission from the deny bitfield
      deny &= ~perm;
    }
    if (permissions.length > 0) {
      // No point making a database call if nothing has changed
      // Set the new permissions
      await this._setChannelUserPermission({
        userId,
        channelId,
        guildId,
        allow,
        deny,
      });
    }
    return {
      allow: allow,
      deny: deny,
    };
  }

  // This function will "reset" a permission for a user on a channel overwrite level
  // That means it is not present in either the user's allow or deny bitfields
  // It will then return the resulting permissions
  public async resetChannelUserPermissions({
    userId,
    permissions,
    channelId,
    guildId,
    session,
  }: {
    session: GuildSession;
    userId: Snowflake;
    permissions: number[];
    channelId: Snowflake;
    guildId: Snowflake;
  }): Promise<PermissionAllowAndDenyData> {
    // Check if the user has all permissions being managed
    await this.checkPermissions({
      session,
      channelId,
    });
    const channelPermissions = await this.getAllChannelPermissions(channelId);
    // Get existing allow and deny for the user
    let { allow, deny } = this._getAllowAndDenyUserPermissions({
      permissions: channelPermissions,
      userId,
    });
    for (const perm of permissions) {
      // Remove the permission from the allow bitfield
      allow &= ~perm;
      // Remove the permission from the deny bitfield
      deny &= ~perm;
    }
    if (permissions.length > 0) {
      // No point making a database call if nothing has changed
      // Set the new permissions
      await this._setChannelUserPermission({
        userId,
        channelId,
        guildId,
        allow,
        deny,
      });
    }
    return {
      allow: allow,
      deny: deny,
    };
  }

  // This function will deny a permission for a user on a channel overwrite level.
  // It will also remove said permission from the user channel allow bitfield, if it is in the allow bitfield
  // It returns the resulting permission
  public async denyChannelUserPermissions({
    userId,
    permissions,
    channelId,
    guildId,
    session,
  }: {
    session: GuildSession;
    userId: Snowflake;
    permissions: number[];
    channelId: Snowflake;
    guildId: Snowflake;
  }): Promise<PermissionAllowAndDenyData> {
    // Check if the user has all permissions being managed
    await this.checkPermissions({
      session,
      channelId,
    });
    const channelPermissions = await this.getAllChannelPermissions(channelId);
    // Get existing allow and deny for the user
    let { allow, deny } = this._getAllowAndDenyUserPermissions({
      permissions: channelPermissions,
      userId,
    });
    for (const perm of permissions) {
      // Remove the permission from the allow bitfield
      allow &= ~perm;
      // Add the permission to the deny bitfield
      deny |= perm;
    }
    if (permissions.length > 0) {
      // No point making a database call if nothing has changed
      // Set the new permissions
      await this._setChannelUserPermission({
        userId,
        channelId,
        guildId,
        allow,
        deny,
      });
    }
    return {
      allow: allow,
      deny: deny,
    };
  }
}

export default PermissionManager;
