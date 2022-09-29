// Cancel deleting a message at the confirmation stage
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

import { failureRed } from "../../constants";
import { GuildSession } from "../../lib/session";
import { addTipToEmbed } from "../../lib/tips";
import { InternalInteractionType } from "../interaction";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function handleCancelDeleteButton(
  internalInteraction: InternalInteractionType<APIMessageComponentGuildInteraction>,

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  session: GuildSession,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  instance: FastifyInstance
): Promise<APIInteractionResponseUpdateMessage> {
  const interaction = internalInteraction.interaction;
  // Edit original confirmation message to show that the message was not deleted
  const embed = interaction.message.embeds[0];
  embed.color = failureRed;
  embed.title = "Message Deletion Cancelled";
  const components = interaction.message.components
    ? interaction.message.components[0].components
    : [];

  components.forEach((component) => {
    // Disable all components so that the user can't delete the message from this confirmation
    component.disabled = true;
  });
  const otherComponent: APIActionRowComponent<APIMessageActionRowComponent> = {
    type: ComponentType.ActionRow,
    components: components,
  };
  return {
    type: InteractionResponseType.UpdateMessage,
    data: {
      embeds: [addTipToEmbed(embed)],
      components: [otherComponent],
      flags: MessageFlags.Ephemeral,
    },
  };
}
