import {
  APIModalSubmitGuildInteraction,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors";
import { sendMessage } from "../../lib/messages/send";
import { InternalInteraction } from "../interaction";
import { InteractionReturnData } from "../types";
// Guild only
export default async function handleModalSend(
  internalInteraction: InternalInteraction<APIModalSubmitGuildInteraction>,
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  const channelId: string | undefined =
    interaction.data.custom_id.split(":")[1];

  if (!channelId) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.MODAL_CUSTOM_ID_MALFORMED,
      "No channel id on modal submit"
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

  await sendMessage({
    channelId,
    content,
    instance,
    guildId: interaction.guild_id,
    user: interaction.member,
  });

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: ":white_check_mark: Message sent!",
      flags: MessageFlags.Ephemeral,
    },
  };
}
