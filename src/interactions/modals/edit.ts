import {
  APIInteractionResponse,
  APIModalSubmitGuildInteraction,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors";
import { editMessage } from "../../lib/messages/edit";
import { InternalInteraction } from "../interaction";

export default async function handleModalEdit(
  internalInteraction: InternalInteraction<APIModalSubmitGuildInteraction>,
  instance: FastifyInstance
): Promise<APIInteractionResponse> {
  const interaction = internalInteraction.interaction;
  const messageId: string | undefined =
    interaction.data.custom_id.split(":")[1]; // TODO: Include the channel id in the custom_id

  if (!messageId) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.MODAL_CUSTOM_ID_MALFORMED,
      "No message id on modal submit"
    );
  }

  const content = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "content"
  )?.components[0].value;

  if (!content) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.MODAL_SUBMIT_MISSING_REQUIRED_INPUT,
      "No content on modal submit"
    );
  }
  if (!interaction.channel_id) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.GENERIC_UNEXPECTED_FAILURE,
      "Missing channel_id on modal submit"
    ); // Not sure why this might happen
  }
  await editMessage({
    content,

    channelId: interaction.channel_id,
    instance,
    user: interaction.member,
    messageId,
    guildId: interaction.guild_id,
  });
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: "Message edited!",
      flags: MessageFlags.Ephemeral,
    },
  };
}
