// Contains logic to handle threads

import { Snowflake } from "discord-api-types/globals";
import { ChannelType } from "discord-api-types/v9";
import { Guild } from "redis-discord-cache";

import { getGuildChannelHandleErrors } from "../messages/utils";

// This function will check if a channel is a thread and if it is, it will return the parent channel id
// Used for permission checks, as permissions are on the parent channel level for threads
const getParentIdIfParentIdExists = async (
  channelOrThreadId: Snowflake,
  guild: Guild
): Promise<Snowflake> => {
  const channel = await getGuildChannelHandleErrors({
    channelId: channelOrThreadId,
    guild,
  });
  if (
    channel.type === ChannelType.GuildNewsThread ||
    channel.type === ChannelType.GuildPublicThread ||
    channel.type === ChannelType.GuildPrivateThread
  ) {
    return channel.parent_id as Snowflake; // This must exist on all thread channels
  }
  return channel.id;
};

export { getParentIdIfParentIdExists };
