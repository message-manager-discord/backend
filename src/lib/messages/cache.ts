// This manages the currently editing messages stored in cache

import { Snowflake } from "discord-api-types/globals";
import { FastifyInstance } from "fastify";

import {
  ExpectedFailure,
  InteractionOrRequestFinalStatus,
  LimitHit,
} from "../../errors";
import { checkEmbedMeetsLimits } from "./embeds/checks";
import { StoredEmbed } from "./embeds/types";

const createMessageCacheKey = (
  interactionId: Snowflake,
  channelId: Snowflake
): string => {
  return `${interactionId}-${channelId}`; // use - to separate to avoid collisions with custom_id
};

const splitMessageCacheKey = (
  key: string
): {
  interactionId: Snowflake;
  channelId: Snowflake;
} => {
  const [interactionId, channelId] = key.split("-");
  return {
    interactionId,
    channelId,
  };
};

interface MessageSavedInCache {
  content?: string;
  embed?: StoredEmbed;
  messageId?: Snowflake;
}

const saveMessageToCache = ({
  key,
  data,
  instance,
}: {
  key: string;
  data: MessageSavedInCache;
  instance: FastifyInstance;
}): Promise<void> => {
  // Check if embed exceeds limits
  if (data.embed !== undefined) {
    const exceedsLimits = checkEmbedMeetsLimits(data.embed);
    if (exceedsLimits) {
      throw new LimitHit(
        InteractionOrRequestFinalStatus.EMBED_EXCEEDS_DISCORD_LIMITS,
        "The embed exceeds one or more of limits on embeds."
      );
    }
  }
  return instance.redisCache.setMessageCache(key, data);
};

const getMessageFromCache = async ({
  key,
  instance,
}: {
  key: string;
  instance: FastifyInstance;
}): Promise<MessageSavedInCache> => {
  const message = await instance.redisCache.getMessageCache(key);
  if (message === null) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MESSAGE_GENERATION_CACHE_NOT_FOUND,
      "The cache for this message generation was not found. This could be due to a timeout - or a restart. \nPlease try the initial action again, and if this error persists, contact support."
    );
  }
  return message;
};

export {
  createMessageCacheKey,
  getMessageFromCache,
  MessageSavedInCache,
  saveMessageToCache,
  splitMessageCacheKey,
};
