import {
  APIActionRowComponent,
  APIInteractionResponse,
  APIMessageActionRowComponent,
  APIMessageComponentGuildInteraction,
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import { embedPink, successGreen } from "../../constants";
import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors";
import { checkDeletePossible, deleteMessage } from "../../messages/delete";
import { InternalInteraction } from "../interaction";

export default async function handleConfirmDeleteButton(
  internalInteraction: InternalInteraction<APIMessageComponentGuildInteraction>,
  instance: FastifyInstance
): Promise<APIInteractionResponse> {
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
    user: interaction.member,
    guildId: interaction.guild_id,
    channelId: interaction.channel_id,
    instance,
    messageId,
  });
  return {
    type: InteractionResponseType.UpdateMessage,
    data: {
      embeds: [embed],
      components: [otherComponent],
      flags: MessageFlags.Ephemeral,
    },
  };
}
