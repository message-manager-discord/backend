import {
  APIActionRowComponent,
  APIInteractionResponseUpdateMessage,
  APIMessageActionRowComponent,
  APIMessageComponentGuildInteraction,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import { successGreen } from "../../constants";
import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors";
import { deleteMessage } from "../../lib/messages/delete";
import { GuildSession } from "../../lib/session";
import { addTipToEmbed } from "../../lib/tips";
import { InternalInteractionType } from "../interaction";

export default async function handleConfirmDeleteButton(
  internalInteraction: InternalInteractionType<APIMessageComponentGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance
): Promise<APIInteractionResponseUpdateMessage> {
  // Not deferred as no logic is 'heavy'
  const interaction = internalInteraction.interaction;
  const messageId = interaction.data.custom_id.split(":")[1];
  if (!messageId) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.COMPONENT_CUSTOM_ID_MALFORMED,
      "No message id on delete button"
    );
  }
  const embed = interaction.message.embeds[0];
  embed.color = successGreen;
  embed.title = "Message Deleted";
  const components = interaction.message.components
    ? interaction.message.components[0].components
    : [];

  components.forEach((component) => {
    component.disabled = true;
  });
  const otherComponent: APIActionRowComponent<APIMessageActionRowComponent> = {
    type: ComponentType.ActionRow,
    components: components,
  };
  await deleteMessage({
    session,
    channelId: interaction.channel_id,
    instance,
    messageId,
  });

  return {
    type: InteractionResponseType.UpdateMessage,
    data: {
      embeds: [addTipToEmbed(embed)],
      components: [otherComponent],
      flags: MessageFlags.Ephemeral,
    },
  };
}
