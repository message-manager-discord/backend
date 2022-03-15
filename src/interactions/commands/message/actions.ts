import {
  APIButtonComponent,
  APIChatInputApplicationCommandGuildInteraction,
  APIInteractionResponse,
  APIMessageApplicationCommandGuildInteraction,
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../../errors";
import { getMessageActionsPossible } from "../../../lib/messages/permissions";
import { InternalInteraction } from "../../interaction";

export default async function handleActionMessageCommand(
  internalInteraction: InternalInteraction<APIMessageApplicationCommandGuildInteraction>,
  instance: FastifyInstance
): Promise<APIInteractionResponse> {
  // This command will generate a ephemeral message with the action buttons for editing, deleting, or reporting.
  // The command will also check permissions for the invoking user

  const interaction = internalInteraction.interaction;
  const messageId = interaction.data.target_id;
  const message = interaction.data.resolved.messages[messageId];
  if (!message) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_RESOLVED_MISSING_EXPECTED_VALUE,
      "Message not found in resolved data"
    );
  }
  // The result does not need to be checked if it is not possible it will throw
  const possibleActions = await getMessageActionsPossible({
    message,
    user: interaction.member,
    instance,
    guildId: interaction.guild_id,
  });

  const components: APIButtonComponent[] = [];
  if (possibleActions.edit) {
    components.push({
      type: ComponentType.Button,
      custom_id: `edit:${message.id}`,
      label: "Edit",
      style: ButtonStyle.Success,
    });
  }
  if (possibleActions.delete) {
    components.push({
      type: ComponentType.Button,
      custom_id: `delete:${message.id}`,
      label: "Delete",
      style: ButtonStyle.Danger,
    });
  }
  components.push({
    type: ComponentType.Button,
    custom_id: `report:${message.id}`,
    label: "Report",
    style: ButtonStyle.Danger,
  });

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      flags: MessageFlags.Ephemeral,
      content:
        `Click on the below buttons to edit, delete, or report [this message](https://discord.com/channels/${interaction.guild_id}/${message.channel_id}/${message.id})` +
        `\nIf the action is not available, you may be missing the required permissions for that action.`,
      components: [
        {
          type: ComponentType.ActionRow,
          components,
        },
      ],
    },
  };
}
