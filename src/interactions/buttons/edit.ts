// Edit button - start a message generation flow with the edit type from it
import {
  APIEmbedAuthor,
  APIEmbedFooter,
  APIMessageComponentGuildInteraction,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors";
import {
  MessageSavedInCache,
  saveMessageToCache,
} from "../../lib/messages/cache";
import { createMessageCacheKey } from "../../lib/messages/cache";
import { checkEditPossible } from "../../lib/messages/edit";
import { StoredEmbed } from "../../lib/messages/embeds/types";
import { GuildSession } from "../../lib/session";
import { InternalInteractionType } from "../interaction";
import { createInitialMessageGenerationEmbed } from "../shared/message-generation";
import { InteractionReturnData } from "../types";

export default async function handleEditButton(
  internalInteraction: InternalInteractionType<APIMessageComponentGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  const messageId = interaction.data.custom_id.split(":")[1];
  if (!messageId) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.COMPONENT_CUSTOM_ID_MALFORMED,
      "No message id on edit button"
    );
  }
  // Check permissions for editing
  const databaseMessage = await checkEditPossible({
    session,
    channelId: interaction.channel_id,
    instance,
    messageId,
  });
  // Create stored embed from the message (from the database message as the message is not included in the interaction)
  let embed: StoredEmbed | undefined = undefined;
  if (databaseMessage?.embed !== null && databaseMessage?.embed !== undefined) {
    let footer: APIEmbedFooter | undefined = undefined;
    if (databaseMessage.embed.footerText !== null) {
      footer = {
        text: databaseMessage.embed.footerText,
        icon_url: databaseMessage.embed.footerIconUrl ?? undefined,
      };
    }
    let author: APIEmbedAuthor | undefined = undefined;
    if (databaseMessage.embed.authorName !== null) {
      author = {
        name: databaseMessage.embed.authorName,
        url: databaseMessage.embed.authorUrl ?? undefined,
        icon_url: databaseMessage.embed.authorIconUrl ?? undefined,
      };
    }

    embed = {
      title: databaseMessage.embed.title ?? undefined,
      description: databaseMessage.embed.description ?? undefined,
      url: databaseMessage.embed.url ?? undefined,
      timestamp: databaseMessage.embed.timestamp?.toISOString() ?? undefined,
      color: databaseMessage.embed.color ?? undefined,
      footer: footer,
      author: author,
      fields:
        databaseMessage.embed.fields.map((field) => ({
          name: field.name,
          value: field.value,
          inline: field.inline,
        })) ?? undefined,
      thumbnail:
        databaseMessage.embed.thumbnailUrl !== null
          ? {
              url: databaseMessage.embed.thumbnailUrl,
            }
          : undefined,
    };
  }

  // Add to cache with key
  const messageGenerationKey = createMessageCacheKey(
    interaction.id,
    interaction.channel_id
  );
  const cacheData: MessageSavedInCache = {
    content: databaseMessage.content ?? undefined,
    embed,
    messageId: messageId,
  };
  await saveMessageToCache({
    key: messageGenerationKey,
    data: cacheData,
    instance,
  });
  // Generate embed for message generation
  const embedData = createInitialMessageGenerationEmbed(
    messageGenerationKey,
    cacheData,
    interaction.guild_id
  );

  return {
    type: InteractionResponseType.UpdateMessage,
    data: {
      embeds: [embedData.embed],
      components: embedData.components,
      flags: MessageFlags.Ephemeral,
    },
  };
}
