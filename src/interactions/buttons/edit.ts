import {
  APIInteractionResponse,
  APIMessageComponentGuildInteraction,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors";
import { checkEditPossible } from "../../lib/messages/edit";
import { InternalInteraction } from "../interaction";
import {
  createModal,
  createTextInputWithRow,
} from "../modals/createStructures";

export default async function handleEditButton(
  internalInteraction: InternalInteraction<APIMessageComponentGuildInteraction>,
  instance: FastifyInstance
): Promise<APIInteractionResponse> {
  const interaction = internalInteraction.interaction;
  const messageId = interaction.data.custom_id.split(":")[1];
  if (!messageId) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.COMPONENT_CUSTOM_ID_MALFORMED,
      "No message id on edit button"
    );
  }
  const databaseMessage = await checkEditPossible({
    user: interaction.member,
    guildId: interaction.guild_id,
    channelId: interaction.channel_id,
    instance,
    messageId,
  });
  return createModal({
    title: "Edit Message",
    custom_id: interaction.data.custom_id, // This is the same ( `edit${messageId}`)
    components: [
      createTextInputWithRow({
        label: "Message Content",
        value: databaseMessage.content,
        max_length: 2000,
        min_length: 1,
        required: true,
        custom_id: "content",
        short: false,
      }),
    ],
  });
}
