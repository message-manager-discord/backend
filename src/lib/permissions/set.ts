import { Snowflake } from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import {
  ExpectedFailure,
  InteractionOrRequestFinalStatus,
  LimitHit,
} from "../../errors";
import limits from "../../limits";

import { Permission, PermissionsData } from "./types";

async function setGuildRolePermissions({
  roleId,
  permission,
  instance,
  guildId,
}: {
  roleId: Snowflake;
  guildId: Snowflake;

  permission: Permission;
  instance: FastifyInstance;
}): Promise<void> {
  // Permissions not checked here, must be checked before
  const guild = await instance.prisma.guild.findUnique({
    where: { id: BigInt(guildId) },
    select: { permissions: true },
  });
  let currentPermissions = guild?.permissions as unknown as
    | PermissionsData
    | undefined;
  if (!currentPermissions) {
    currentPermissions = {
      roles: { [roleId]: permission },
      users: {},
    };
  } else {
    if (!currentPermissions.roles) {
      currentPermissions.roles = { [roleId]: permission };
    } else {
      // Check if the amount of roles exceeds the limit
      if (
        Object.keys(currentPermissions.roles).length >=
        limits.MAX_ROLE_PERMISSIONS
      ) {
        throw new LimitHit(
          InteractionOrRequestFinalStatus.MAX_ROLE_PERMISSIONS,
          `The limit of ${limits.MAX_ROLE_PERMISSIONS} role permissions has been reached on the guild.`
        );
      }
      currentPermissions.roles[roleId] = permission;
    }
  }
  await instance.prisma.guild.upsert({
    where: { id: BigInt(guildId) },
    update: {
      permissions: { ...currentPermissions }, // For some reason prisma doesn't like just the object
    },
    create: {
      permissions: { ...currentPermissions }, // For some reason prisma doesn't like just the object
      id: BigInt(guildId),
    },
  });
}

async function setGuildUserPermissions({
  userId,
  permission,
  instance,
  guildId,
}: {
  userId: Snowflake;
  guildId: Snowflake;

  permission: Permission;
  instance: FastifyInstance;
}): Promise<void> {
  // Permissions not checked here, must be checked before
  const guild = await instance.prisma.guild.findUnique({
    where: { id: BigInt(guildId) },
    select: { permissions: true },
  });

  let currentPermissions = guild?.permissions as unknown as
    | PermissionsData
    | undefined;
  if (!currentPermissions) {
    currentPermissions = {
      roles: {},
      users: { [userId]: permission },
    };
  } else {
    if (!currentPermissions.users) {
      currentPermissions.users = { [userId]: permission };
    } else {
      // Check if the amount of users exceeds the limit
      if (
        Object.keys(currentPermissions.users).length >=
        limits.MAX_USER_PERMISSIONS
      ) {
        throw new LimitHit(
          InteractionOrRequestFinalStatus.MAX_USER_PERMISSIONS,
          `The limit of ${limits.MAX_USER_PERMISSIONS} user permissions has been reached on the guild.`
        );
      }
      currentPermissions.users[userId] = permission;
    }
  }
  await instance.prisma.guild.upsert({
    where: { id: BigInt(guildId) },
    update: {
      permissions: { ...currentPermissions }, // For some reason prisma doesn't like just the object
    },
    create: {
      permissions: { ...currentPermissions }, // For some reason prisma doesn't like just the object
      id: BigInt(guildId),
    },
  });
}

async function setChannelRolePermissions({
  roleId,
  permission,
  instance,
  channelId,
  guildId,
}: {
  guildId: Snowflake;
  roleId: Snowflake;

  channelId: Snowflake;
  permission: Permission;
  instance: FastifyInstance;
}): Promise<void> {
  if (permission === Permission.MANAGE_CONFIG) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MANAGE_CONFIG_PERMISSION_CANNOT_BE_SET_ON_CHANNEL_LEVEL,
      "The manage config permission cannot be set for a user, or a role, on a channel."
    );
  }
  // Permissions not checked here, must be checked before
  const channel = await instance.prisma.channel.findUnique({
    where: { id: BigInt(channelId) },
    select: { permissions: true },
  });
  let currentPermissions = channel?.permissions as unknown as
    | PermissionsData
    | undefined;
  if (!currentPermissions) {
    currentPermissions = {
      roles: { [roleId]: permission },
      users: {},
    };
  } else {
    if (!currentPermissions.roles) {
      currentPermissions.roles = { [roleId]: permission };
    } else {
      // Check if the amount of roles exceeds the limit
      if (
        Object.keys(currentPermissions.roles).length >=
        limits.MAX_ROLE_PERMISSIONS
      ) {
        throw new LimitHit(
          InteractionOrRequestFinalStatus.MAX_ROLE_PERMISSIONS,
          `The limit of ${limits.MAX_ROLE_PERMISSIONS} role permissions has been reached on this channel.`
        );
      }
      currentPermissions.roles[roleId] = permission;
    }
  }
  await instance.prisma.channel.upsert({
    where: { id: BigInt(channelId) },
    update: {
      permissions: { ...currentPermissions }, // For some reason prisma doesn't like just the object
    },
    create: {
      permissions: { ...currentPermissions }, // For some reason prisma doesn't like just the object
      id: BigInt(channelId),
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

async function setChannelUserPermissions({
  userId,
  permission,
  instance,
  channelId,
  guildId,
}: {
  guildId: Snowflake;
  userId: Snowflake;

  channelId: Snowflake;
  permission: Permission;
  instance: FastifyInstance;
}): Promise<void> {
  if (permission === Permission.MANAGE_CONFIG) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MANAGE_CONFIG_PERMISSION_CANNOT_BE_SET_ON_CHANNEL_LEVEL,
      "The manage config permission cannot be set for a user, or a role, on a channel."
    );
  }
  // Permissions not checked here, must be checked before
  const channel = await instance.prisma.channel.findUnique({
    where: { id: BigInt(channelId) },
    select: { permissions: true },
  });
  let currentPermissions = channel?.permissions as unknown as
    | PermissionsData
    | undefined;
  if (!currentPermissions) {
    currentPermissions = {
      roles: {},
      users: { [userId]: permission },
    };
  } else {
    if (!currentPermissions.users) {
      currentPermissions.users = { [userId]: permission };
    } else {
      // Check if the amount of user permissions is at the limit
      if (
        Object.keys(currentPermissions.users).length >=
        limits.MAX_USER_PERMISSIONS
      ) {
        throw new LimitHit(
          InteractionOrRequestFinalStatus.MAX_USER_CHANNEL_PERMISSIONS,
          `The limit of ${limits.MAX_USER_PERMISSIONS} user permissions has been reached on this channel.`
        );
      }
      currentPermissions.users[userId] = permission;
    }
  }
  await instance.prisma.channel.upsert({
    where: { id: BigInt(channelId) },
    update: {
      permissions: { ...currentPermissions }, // For some reason prisma doesn't like just the object
    },
    create: {
      permissions: { ...currentPermissions }, // For some reason prisma doesn't like just the object
      id: BigInt(channelId),
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
export {
  setGuildRolePermissions,
  setGuildUserPermissions,
  setChannelRolePermissions,
  setChannelUserPermissions,
};
