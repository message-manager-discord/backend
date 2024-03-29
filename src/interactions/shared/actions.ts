// Shared logic for actions command. Shared as it is currently used by both a context menu command
// and a chat input command. This is because there are currently some mobile devices that do not support
// context menu commands
import {
  APIButtonComponent,
  APIChatInputApplicationCommandGuildInteraction,
  APIMessage,
  APIMessageApplicationCommandGuildInteraction,
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import { embedPink } from "../../constants";
import { getMessageActionsPossible } from "../../lib/messages/checks";
import { GuildSession } from "../../lib/session";
import { addTipToEmbed } from "../../lib/tips";
import { InteractionReturnData } from "../types";

// Function to get the actions for a message
const actionsLogic = async ({
  instance,
  message,
  interaction,
  session,
}: {
  instance: FastifyInstance;
  message: APIMessage;
  interaction:
    | APIChatInputApplicationCommandGuildInteraction
    | APIMessageApplicationCommandGuildInteraction;
  session: GuildSession;
}): Promise<InteractionReturnData> => {
  // The result does not need to be checked if it is not possible it will throw
  const possibleActions = await getMessageActionsPossible({
    message,
    instance,
    guildId: interaction.guild_id,
    session,
  });

  // Add buttons for each action that can be taken by the user
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
  // All users should be able to report a message
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
};

export { actionsLogic };
