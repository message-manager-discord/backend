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
import { addTipToEmbed } from "../../lib/tips";
import { InternalInteraction } from "../interaction";
import { InteractionReturnData } from "../types";

export default async function handleDeleteButton(
  internalInteraction: InternalInteraction<APIMessageComponentGuildInteraction>,
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
  const databaseMessage = await checkDeletePossible({
    user: interaction.member,
    guildId: interaction.guild_id,
    channelId: interaction.channel_id,
    instance,
    messageId,
  });
  const content = databaseMessage.content;
  const maxLength = 150;
  const embed: APIEmbed = {
    title: "Delete Message",
    url: `https://discord.com/channels/${interaction.guild_id}/${databaseMessage.channelId}/${messageId}`,
    description: `Are you sure you want to delete this message?\n**Content:**\n\n${
      content.length > maxLength
        ? `${content.substring(0, maxLength)}...`
        : content
    }`,

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
