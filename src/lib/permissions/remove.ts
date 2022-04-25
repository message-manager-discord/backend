import { Snowflake } from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import { PermissionsData } from "./types";

async function removeGuildRolePermissions({
  roleId,
  instance,
  guildId,
}: {
  roleId: Snowflake;
  guildId: Snowflake;
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
    currentPermissions = {};
  } else {
    if (currentPermissions.roles) {
      delete currentPermissions.roles[roleId];
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

async function removeGuildUserPermissions({
  userId,
  instance,
  guildId,
}: {
  userId: Snowflake;
  guildId: Snowflake;
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
    currentPermissions = {};
  } else {
    if (currentPermissions.users) {
      delete currentPermissions.users[userId];
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

async function removeChannelRolePermissions({
  roleId,
  instance,
  channelId,
  guildId,
}: {
  guildId: Snowflake;
  roleId: Snowflake;
  channelId: Snowflake;
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
    currentPermissions = {};
  } else {
    if (currentPermissions.roles) {
      delete currentPermissions.roles[roleId];
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

async function removeChannelUserPermissions({
  userId,
  instance,
  channelId,
  guildId,
}: {
  guildId: Snowflake;
  userId: Snowflake;
  channelId: Snowflake;
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
    currentPermissions = {};
  } else {
    if (currentPermissions.users) {
      delete currentPermissions.users[userId];
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
  removeGuildRolePermissions,
  removeGuildUserPermissions,
  removeChannelRolePermissions,
  removeChannelUserPermissions,
};
