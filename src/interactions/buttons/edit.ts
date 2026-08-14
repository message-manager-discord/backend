// Edit button - start a message generation flow with the edit type from it
import type { APIMessageComponentGuildInteraction } from "discord-api-types/v9";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v9";
import type { FastifyInstance } from "fastify";

import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors.js";
import type { MessageSavedInCache } from "../../lib/messages/cache.js";
import { saveMessageToCache } from "../../lib/messages/cache.js";
import { createMessageCacheKey } from "../../lib/messages/cache.js";
import { checkEditPossible } from "../../lib/messages/edit.js";
import { createStoredEmbedFromDataBaseEmbed } from "../../lib/messages/embeds/parser.js";
import type { StoredEmbed } from "../../lib/messages/embeds/types.js";
import type { GuildSession } from "../../lib/session/index.js";
import type { InternalInteractionType } from "../interaction.js";
import { createInitialMessageGenerationEmbed } from "../shared/message-generation.js";
import type { InteractionReturnData } from "../types.js";

export default async function handleEditButton(
  internalInteraction: InternalInteractionType<APIMessageComponentGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance,
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  const messageId = interaction.data.custom_id.split(":")[1];
  if (!messageId) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.COMPONENT_CUSTOM_ID_MALFORMED,
      "No message id on edit button",
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
    embed = createStoredEmbedFromDataBaseEmbed(databaseMessage.embed);
  }

  // Add to cache with key
  const messageGenerationKey = createMessageCacheKey(
    interaction.id,
    interaction.channel_id,
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
    interaction.guild_id,
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
