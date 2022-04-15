import { Snowflake } from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import { PermissionsData } from "./types";

async function getGuildPermissions(
  guildId: Snowflake,
  instance: FastifyInstance
): Promise<PermissionsData | null> {
  const guild = await instance.prisma.guild.findUnique({
    where: { id: BigInt(guildId) },
    select: { permissions: true },
  });
  if (!guild || !guild.permissions) {
    return null;
  } else {
    const permissions = guild.permissions as unknown as PermissionsData;
    return permissions;
  }
}
interface GetGuildPermissionsWithChannelsReturnChannel {
  permissions: PermissionsData | null;
  id: Snowflake;
}

interface GetGuildPermissionsWithChannelsReturn {
  permissions: PermissionsData | null;
  channels: GetGuildPermissionsWithChannelsReturnChannel[];
}

async function getGuildPermissionsWithChannels(
  guildId: Snowflake,
  instance: FastifyInstance
): Promise<GetGuildPermissionsWithChannelsReturn | null> {
  const guild = await instance.prisma.guild.findUnique({
    where: { id: BigInt(guildId) },
    select: { permissions: true, channels: true },
  });
  if (!guild) {
    return null;
  } else if (!!guild.permissions || guild.channels.length < 1) {
    const permissions = guild.permissions as unknown as PermissionsData;
    return {
      channels: guild.channels.map((channel) => ({
        id: channel.id.toString(),
        permissions: channel.permissions as unknown as PermissionsData,
      })),
      permissions,
    };
  } else if (!guild.permissions && guild.channels.length > 0) {
    return {
      channels: guild.channels.map((channel) => ({
        id: channel.id.toString(),
        permissions: channel.permissions as unknown as PermissionsData,
      })),
      permissions: null,
    };
  } else {
    return null;
  }
}

async function getChannelPermissions(
  channelId: Snowflake,
  instance: FastifyInstance
) {
  const channel = await instance.prisma.channel.findUnique({
    where: { id: BigInt(channelId) },
    select: { permissions: true },
  });
  if (!channel || !channel.permissions) {
    return null;
  } else {
    const permissions = channel.permissions as unknown as PermissionsData;
    return permissions;
  }
}
export {
  getChannelPermissions,
  getGuildPermissions,
  getGuildPermissionsWithChannels,
  GetGuildPermissionsWithChannelsReturnChannel,
};
