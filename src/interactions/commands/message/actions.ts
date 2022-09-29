// Action message context menu
import {
  APIMessage,
  APIMessageApplicationCommandGuildInteraction,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../../errors";
import { GuildSession } from "../../../lib/session";
import { InternalInteractionType } from "../../interaction";
import { actionsLogic } from "../../shared/actions";
import { InteractionReturnData } from "../../types";

export default function handleActionMessageCommand(
  internalInteraction: InternalInteractionType<APIMessageApplicationCommandGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance
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
      "Message not found in resolved data"
    );
  }
  return actionsLogic({
    interaction,
    message,
    session,
    instance,
  });
}
