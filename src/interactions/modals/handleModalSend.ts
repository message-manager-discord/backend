import {
  APIInteractionResponse,
  APIModalSubmitGuildInteraction,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import { MissingAccessBase } from "../../messages/errors";
import { sendMessage } from "../../messages/send";
// Guild only
export default async function handleModalSend(
  interaction: APIModalSubmitGuildInteraction,
  instance: FastifyInstance
): Promise<APIInteractionResponse> {
  const channelId: string | undefined =
    interaction.data.custom_id.split(":")[1];

  if (!channelId) {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content:
          ":exclamation: Something went wrong! Please try again.    " +
          "\n If the problem persists, contact the bot developers. Error: No channel ID on modal submit" +
          "\n *PS: This shouldn't happen*",
        flags: MessageFlags.Ephemeral,
      },
    };
  }

  const tags = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "tags"
  )?.components[0].value;
  const content = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "content"
  )?.components[0].value;

  if (!tags || !content) {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: ":exclamation: You must provide tags and content",
        flags: MessageFlags.Ephemeral,
      },
    };
  }
  console.log(tags);
  console.log(
    tags
      .replace(/\s/g, "") // Remove blankspace
      .toLowerCase() // Default to lowercase
      .split(",") // Split by comma
      .filter((tag) => tag !== "")
  );
  try {
    await sendMessage({
      channelId,
      content,
      tags: tags
        .replace(/\s/g, "") // Remove blankspace
        .toLowerCase() // Default to lowercase
        .split(",") // Split by comma
        .filter((tag) => tag !== ""), // Remove empty tags (for example if there was a comma on the end)
      instance,
      guildId: interaction.guild_id,
      user: interaction.member,
    });
  } catch (error) {
    if (error instanceof MissingAccessBase) {
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: `:exclamation: ${error.message}`,
          flags: MessageFlags.Ephemeral,
        },
      };
    }
    throw error;
  }
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: ":white_check_mark: Message sent!",
      flags: MessageFlags.Ephemeral,
    },
  };
}
