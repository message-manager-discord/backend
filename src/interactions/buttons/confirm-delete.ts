// Handle confirmation of the deletion of a message at the confirmation stage
import type {
  APIActionRowComponent,
  APIComponentInMessageActionRow,
  APIInteractionResponseUpdateMessage,
  APIMessageComponentGuildInteraction,
} from "discord-api-types/v9";
import {
  ComponentType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import type { FastifyInstance } from "fastify";

import { successGreen } from "../../constants.js";
import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors.js";
import { deleteMessage } from "../../lib/messages/delete.js";
import type { GuildSession } from "../../lib/session/index.js";
import { addTipToEmbed } from "../../lib/tips/index.js";
import type { InternalInteractionType } from "../interaction.js";

export default async function handleConfirmDeleteButton(
  internalInteraction: InternalInteractionType<APIMessageComponentGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance,
): Promise<APIInteractionResponseUpdateMessage> {
  // Not deferred as no logic is 'heavy'

  const interaction = internalInteraction.interaction;
  // Discord payloads may omit the channel despite the guild interaction type.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const channelId = interaction.channel?.id;
  const messageId = interaction.data.custom_id.split(":")[1];
  if (!messageId) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.COMPONENT_CUSTOM_ID_MALFORMED,
      "No message id on delete button",
    );
  }

  if (!channelId) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.INTERACTIONS_CHANNEL_OBJECT_MISSING,
      "No channel on interaction",
      // TODO: Check if this is a problem or not
    );
  }
  // Edit the embed of the confirmation message in the response
  const embed = interaction.message.embeds[0];
  embed.color = successGreen;
  embed.title = "Message Deleted";
  const actionRow = interaction.message.components?.find(
    (component) => component.type === ComponentType.ActionRow,
  );

  const components: APIComponentInMessageActionRow[] =
    actionRow?.type === ComponentType.ActionRow ? actionRow.components : [];

  components.forEach((component) => {
    // Disable all components as the message is now deleted
    component.disabled = true;
  });

  const otherComponent: APIActionRowComponent<APIComponentInMessageActionRow> =
    {
      // Replace existing components with new components
      type: ComponentType.ActionRow,
      components,
    };
  await deleteMessage({
    // Actually delete the message
    session,
    channelId: channelId,
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
