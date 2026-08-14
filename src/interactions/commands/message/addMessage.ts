// Migration message context menu
import {
  APIMessage,
  APIMessageApplicationCommandGuildInteraction,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../../errors.js";
import { GuildSession } from "../../../lib/session/index.js";
import { InternalInteractionType } from "../../interaction.js";
import { addMessageLogic } from "../../shared/addMessage.js";
import { InteractionReturnData } from "../../types.js";

export default function handleAddMessageMessageCommand(
  internalInteraction: InternalInteractionType<APIMessageApplicationCommandGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance,
): Promise<InteractionReturnData> {
  // This command will generate a ephemeral message with the action buttons for editing, deleting, or reporting.
  // The command will also check permissions for the invoking user

  const interaction = internalInteraction.interaction;
  const messageId = interaction.data.target_id;
  const message = interaction.data.resolved.messages[messageId] as
    | APIMessage
    | undefined;
  if (message === undefined) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_RESOLVED_MISSING_EXPECTED_VALUE,
      "Message not found in resolved data",
    );
  }

  return addMessageLogic({
    interaction,
    message,
    session,
    instance,
  });
}
