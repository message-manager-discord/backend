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
  // Not deferred as no logic is 'heavy'
  const interaction = internalInteraction.interaction;

  const embed = interaction.message.embeds[0];
  embed.color = failureRed;
  embed.title = "Message Deletion Cancelled";
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
  return {
    type: InteractionResponseType.UpdateMessage,
    data: {
      embeds: [addTipToEmbed(embed)],
      components: [otherComponent],
      flags: MessageFlags.Ephemeral,
    },
  };
}
