import {
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
import { createStoredEmbedFromDataBaseEmbed } from "../../lib/messages/embeds/parser";
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
  const databaseMessage = await checkEditPossible({
    session,
    channelId: interaction.channel_id,
    instance,
    messageId,
  });

  let embed: StoredEmbed | undefined = undefined;
  if (databaseMessage?.embed !== null && databaseMessage?.embed !== undefined) {
    embed = createStoredEmbedFromDataBaseEmbed(databaseMessage.embed);
  }

  const messageGenerationKey = createMessageCacheKey(
    interaction.id,
    interaction.channel_id // TODO: Check if this is ok
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
