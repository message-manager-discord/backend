import {
  APIMessageComponentGuildInteraction,
  APIMessageSelectMenuInteractionData,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors";
import { getMessageFromCache } from "../../lib/messages/cache";
import { GuildSession } from "../../lib/session";
import { InternalInteractionType } from "../interaction";
import {
  createModal,
  createTextInputWithRow,
} from "../modals/createStructures";
import {
  generateMessageGenerationCustomId,
  MessageGenerationButtonTypes,
} from "../shared/message-generation";
import { InteractionReturnData } from "../types";

export default async function handleMessageGenerationSelect(
  internalInteraction: InternalInteractionType<APIMessageComponentGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  const customIdData = interaction.data.custom_id.split(":");
  const messageGenerationKey = customIdData[1] as string | undefined;
  const messageGenerationType = customIdData[2] as
    | MessageGenerationButtonTypes
    | undefined;
  if (
    messageGenerationKey === undefined ||
    messageGenerationType === undefined
  ) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.COMPONENT_CUSTOM_ID_MALFORMED,
      "No message key on message generation button"
    );
  }
  const currentStatus = await getMessageFromCache({
    key: messageGenerationKey,
    instance,
  });
  const index = parseInt(
    (interaction.data as APIMessageSelectMenuInteractionData).values[0]
  );
  const currentField = currentStatus.embed?.fields?.[index];
  console.log(index);

  if (currentField === undefined) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.FIELD_SELECT_OUT_OF_INDEX,
      "Fields out of index"
    );
  }
  return createModal({
    title: "Edit Field",
    custom_id: generateMessageGenerationCustomId(
      messageGenerationKey,
      "edit-embed-field",
      index
    ),
    components: [
      createTextInputWithRow({
        label: "Embed Field Name",
        value: currentField.name,
        max_length: 256,
        required: false,
        custom_id: "name",
        placeholder: "Field name",
        short: true,
      }),
      createTextInputWithRow({
        label: "Embed Field Value",
        value: currentField.value,
        max_length: 1024,
        required: false,
        custom_id: "value",
        placeholder: "Field value",
        short: false,
      }),
      createTextInputWithRow({
        label: "Embed Field Inline",
        value:
          currentField.inline !== undefined
            ? currentField.inline
              ? "true"
              : "false"
            : undefined,
        max_length: 15,
        required: false,
        custom_id: "inline",
        placeholder: "Field inline - default 'false'",
        short: true,
      }),
    ],
  });
}
