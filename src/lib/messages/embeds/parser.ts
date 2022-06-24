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
    footerText: embed.footer?.text,
    authorName: embed.author?.name,
    fields: embed.fields,
  };
};

const createSendableEmbedFromStoredEmbed = (embed: StoredEmbed): APIEmbed => {
  const sendableEmbed: APIEmbed = {
    title: embed.title,
    description: embed.description,
    url: embed.url,
    timestamp: embed.timestamp,
    color: embed.color,
  };
  if (embed.footerText !== undefined) {
    sendableEmbed.footer = {
      text: embed.footerText,
    };
  }
  if (embed.authorName !== undefined) {
    sendableEmbed.author = {
      name: embed.authorName,
    };
  }
  if (embed.fields !== undefined) {
    sendableEmbed.fields = embed.fields;
  }
  return sendableEmbed;
};

export { createSendableEmbedFromStoredEmbed,createStoredEmbedFromAPIMessage };
