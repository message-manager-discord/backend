// Handle message generation select menu - this is for embed field editing
// Returns a modal with the field's current values
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
import { generateMessageGenerationCustomId } from "../shared/message-generation";
import { InteractionReturnData } from "../types";

// Function to handle the message generation select menu
export default async function handleMessageGenerationSelect(
  internalInteraction: InternalInteractionType<APIMessageComponentGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  const customIdData = interaction.data.custom_id.split(":");
  const messageGenerationKey = customIdData[1] as string | undefined; // The message generation cache key

  if (messageGenerationKey === undefined) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.COMPONENT_CUSTOM_ID_MALFORMED,
      "No message key on message generation button"
    );
  }
  // Get current state of the edit
  const currentStatus = await getMessageFromCache({
    key: messageGenerationKey,
    instance,
  });
  // Get which field is being edited
  const index = parseInt(
    (interaction.data as APIMessageSelectMenuInteractionData).values[0]
  );
  const currentField = currentStatus.embed?.fields?.[index];

  // Shouldn't happen - but for type safety
  if (currentField === undefined) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.FIELD_SELECT_OUT_OF_INDEX,
      "Fields out of index"
    );
  }
  // return generated modal with text inputs for each embed field - with the current values
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
        short: false,
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
