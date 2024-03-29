// Button to delete a message - will response with a confirmation as this is a destructive action
import {
  APIEmbed,
  APIMessageComponentGuildInteraction,
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import { embedPink } from "../../constants";
import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors";
import { checkDeletePossible } from "../../lib/messages/delete";
import { GuildSession } from "../../lib/session";
import { addTipToEmbed } from "../../lib/tips";
import { InternalInteractionType } from "../interaction";
import { InteractionReturnData } from "../types";

export default async function handleDeleteButton(
  internalInteraction: InternalInteractionType<APIMessageComponentGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  const messageId = interaction.data.custom_id.split(":")[1];
  if (!messageId) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.COMPONENT_CUSTOM_ID_MALFORMED,
      "No message id on delete button"
    );
  }
  // Check if message can be deleted
  const databaseMessage = await checkDeletePossible({
    session,
    channelId: interaction.channel_id,
    instance,
    messageId,
  });
  // Get content from database message (and trim it down to maxLength to avoid overflowing the confirmation embed)
  const content = databaseMessage.content;
  const maxLength = 150;
  const hasEmbed = databaseMessage.embed !== null;
  const embed: APIEmbed = {
    title: "Delete Message",
    url: `https://discord.com/channels/${interaction.guild_id}/${databaseMessage.channelId}/${messageId}`,
    // Also include a message about the embed if an embed exists
    description:
      `Are you sure you want to delete this message?${
        content === null
          ? "No Content"
          : `\n**Content:**\n\n${
              content.length > maxLength
                ? `${content.substring(0, maxLength)}...`
                : content
            }`
      }` +
      (hasEmbed
        ? "\n\nMessage also contains an embed. This action will also delete the embed.}"
        : ""),

    color: embedPink,
  };
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [addTipToEmbed(embed)],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            // Button to proceed or cancel
            {
              type: ComponentType.Button,
              label: "Confirm",
              emoji: { name: "✅" },
              style: ButtonStyle.Primary,
              custom_id: `confirm-delete:${messageId}`,
            },
            {
              type: ComponentType.Button,
              label: "Cancel",
              emoji: { name: "❌" },
              style: ButtonStyle.Danger,
              custom_id: `cancel-delete`, // disable buttons if cancel
            },
          ],
        },
      ],
      flags: MessageFlags.Ephemeral,
    },
  };
}
