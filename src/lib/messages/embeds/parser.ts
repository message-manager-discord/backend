import { APIEmbed, APIMessage } from "discord-api-types/v9";

import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../../errors";
import { StoredEmbed } from "./types";

const createStoredEmbedFromAPIMessage = (
  message: APIMessage
): StoredEmbed | null => {
  const embed = message.embeds[0];
  if (embed === undefined) {
    return null;
  }
  if (message.embeds.length > 1) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.TOO_MANY_EMBEDS,
      "Only one embed is expected on that message."
    );
  }
  return {
    title: embed.title,
    description: embed.description,
    url: embed.url,
    timestamp: embed.timestamp,
    color: embed.color,
    footer: embed.footer,
    author: embed.author,
    thumbnail: embed.thumbnail,
    fields: embed.fields,
  };
};

const createSendableEmbedFromStoredEmbed = (embed: StoredEmbed): APIEmbed => {
  const sendableEmbed: APIEmbed = {
    title: embed.title,
    description: embed.description,
    url: embed.url,
    timestamp: embed.timestamp,
    footer: embed.footer,
    author: embed.author,
    thumbnail: embed.thumbnail,
    color: embed.color,
  };

  if (embed.fields !== undefined) {
    sendableEmbed.fields = embed.fields;
  }
  return sendableEmbed;
};

export { createSendableEmbedFromStoredEmbed, createStoredEmbedFromAPIMessage };
