import {
  APIApplicationCommandInteractionDataChannelOption,
  APIChatInputApplicationCommandGuildInteraction,
  APIInteractionResponse,
  ApplicationCommandOptionType,
  ChannelType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import { MissingAccessBase } from "../../messages/errors";
import {
  checkSendMessagePossible,
  ThreadOptionObject,
} from "../../messages/send";
import {
  createModal,
  createTextInputWithRow,
} from "../modals/createStructures";

export default async function handleSendCommand(
  interaction: APIChatInputApplicationCommandGuildInteraction,
  instance: FastifyInstance
): Promise<APIInteractionResponse> {
  // First option: Channel
  const channelId: string | undefined = (
    interaction.data.options?.find(
      (option) =>
        option.name === "channel" &&
        option.type === ApplicationCommandOptionType.Channel
    ) as APIApplicationCommandInteractionDataChannelOption
  )?.value;
  const channel = interaction.data.resolved?.channels?.[channelId];
  console.log(channel);
  if (!channelId || !channel) {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content:
          ":exclamation: Something went wrong! Please try again.    " +
          "\n If the problem persists, contact the bot developers. Error: No channel ID on send command" +
          "\n *PS: This shouldn't happen*",
        flags: MessageFlags.Ephemeral,
      },
    };
  }
  let threadData: undefined | ThreadOptionObject = undefined;

  if (
    channel.type === ChannelType.GuildNewsThread ||
    channel.type === ChannelType.GuildPrivateThread ||
    channel.type === ChannelType.GuildPublicThread
  ) {
    threadData = {
      parentId: channel.parent_id!,
      locked: channel.thread_metadata?.locked!,
      type: channel.type,
    };
  }
  console.log(channel.thread_metadata?.invitable);

  try {
    await checkSendMessagePossible({
      channelId,
      guildId: interaction.guild_id,
      instance,
      user: interaction.member,
      thread: threadData,
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

  return createModal({
    title: `Sending a message to #${channel.name}`,
    custom_id: `send:${channelId}`,
    components: [
      createTextInputWithRow({
        label: "Tags",
        placeholder: "Comma separated list of tags",
        custom_id: "tags",
        short: true,
        required: false,
      }),
      createTextInputWithRow({
        label: "Message Content",
        placeholder: "Message content to send",
        value: "",
        max_length: 2000,
        min_length: 1,
        required: true,
        custom_id: "content",
        short: false,
      }),
    ],
  });
}
