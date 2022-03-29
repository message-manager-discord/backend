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
import { parseTags } from "./utils";

export default async function handleModalEdit(
  internalInteraction: InternalInteraction<APIModalSubmitGuildInteraction>,
  instance: FastifyInstance
): Promise<APIInteractionResponse> {
  const interaction = internalInteraction.interaction;
  const messageId: string | undefined =
    interaction.data.custom_id.split(":")[1];

  if (!messageId) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.MODAL_CUSTOM_ID_MALFORMED,
      "No message id on modal submit"
    );
  }

  let tags = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "tags"
  )?.components[0].value;
  const content = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "content"
  )?.components[0].value;

  if (!content) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.MODAL_SUBMIT_MISSING_REQUIRED_INPUT,
      "No content on modal submit"
    );
  }
  if (!tags) {
    tags = "";
  }
  await editMessage({
    content,
    tags: parseTags(tags),
    channelId: interaction.channel_id!,
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