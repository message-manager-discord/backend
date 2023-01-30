import { EmbedField, MessageEmbed } from "@prisma/client";
import {
  APIEmbed,
  APIEmbedAuthor,
  APIEmbedFooter,
  APIMessage,
} from "discord-api-types/v9";
// Functions to change between formats accepted by discord's API and internal representations

import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../../errors";
import { StoredEmbed } from "./types";

// Create an internal representation "stored embed" from a discord API message
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

const createStoredEmbedFromDataBaseEmbed = (
  embed: MessageEmbed & {
    fields: EmbedField[] | null | undefined;
  }
): StoredEmbed => {
  let footer: APIEmbedFooter | undefined = undefined;
  if (embed.footerText !== null) {
    footer = {
      text: embed.footerText,
      icon_url: embed.footerIconUrl ?? undefined,
    };
  }
  let author: APIEmbedAuthor | undefined = undefined;
  if (embed.authorName !== null) {
    author = {
      name: embed.authorName,
      url: embed.authorUrl ?? undefined,
      icon_url: embed.authorIconUrl ?? undefined,
    };
  }

  return {
    title: embed.title ?? undefined,
    description: embed.description ?? undefined,
    url: embed.url ?? undefined,
    timestamp: embed.timestamp?.toISOString() ?? undefined,
    color: embed.color ?? undefined,
    footer: footer,
    author: author,
    fields: embed.fields ?? undefined,
    thumbnail:
      embed.thumbnailUrl !== null
        ? {
            url: embed.thumbnailUrl,
          }
        : undefined,
  };
};

// Create a discord API embed from an internal representation "stored embed"
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

export {
  createSendableEmbedFromStoredEmbed,
  createStoredEmbedFromAPIMessage,
  createStoredEmbedFromDataBaseEmbed,
};
