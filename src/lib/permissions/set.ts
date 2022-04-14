import { Snowflake } from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

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
    select: { permissions: true, managementRoleIds: true },
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
    select: { permissions: true, managementRoleIds: true },
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
