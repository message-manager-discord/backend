import {
  APIButtonComponent,
  APIMessage,
  APIMessageApplicationCommandGuildInteraction,
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import { embedPink } from "../../../constants";
import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../../errors";
import { getMessageActionsPossible } from "../../../lib/messages/checks";
import { GuildSession } from "../../../lib/session";
import { addTipToEmbed } from "../../../lib/tips";
import { InternalInteractionType } from "../../interaction";
import { InteractionReturnData } from "../../types";

export default async function handleActionMessageCommand(
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
  // The result does not need to be checked if it is not possible it will throw
  const possibleActions = await getMessageActionsPossible({
    message,
    instance,
    guildId: interaction.guild_id,
    session,
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

  const messageLink = `https://discord.com/channels/${interaction.guild_id}/${message.channel_id}/${message.id}`;

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      flags: MessageFlags.Ephemeral,
      embeds: [
        addTipToEmbed({
          title: "Message Actions",
          color: embedPink,
          description:
            `Click on the below buttons to edit, delete, or report [this message](${messageLink})` +
            `\nIf the action is not available, you may be missing the required permissions for that action.`,

          timestamp: new Date().toISOString(),
          url: messageLink,
        }),
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components,
        },
      ],
    },
  };
}
