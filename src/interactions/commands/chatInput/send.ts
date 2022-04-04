import {
  APIApplicationCommandInteractionDataChannelOption,
  APIChatInputApplicationCommandGuildInteraction,
  APIInteractionResponse,
  ApplicationCommandOptionType,
  ChannelType,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../../errors";
import {
  checkSendMessagePossible,
  ThreadOptionObject,
} from "../../../lib/messages/send";
import {
  createModal,
  createTextInputWithRow,
} from "../../modals/createStructures";
import { InternalInteraction } from "../../interaction";

export default async function handleSendCommand(
  internalInteraction: InternalInteraction<APIChatInputApplicationCommandGuildInteraction>,
  instance: FastifyInstance
): Promise<APIInteractionResponse> {
  const interaction = internalInteraction.interaction;
  // First option: Channel
  const channelId: string | undefined = (
    interaction.data.options?.find(
      (option) =>
        option.name === "channel" &&
        option.type === ApplicationCommandOptionType.Channel
    ) as APIApplicationCommandInteractionDataChannelOption
  )?.value;
  const channel = interaction.data.resolved?.channels?.[channelId];
  if (!channelId) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_MISSING_EXPECTED_OPTION,
      "No channel option on send command"
    );
  }
  if (!channel) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_RESOLVED_MISSING_EXPECTED_VALUE,
      "Channel not found in resolved data"
    );
  }
  let threadData: undefined | ThreadOptionObject = undefined;

  if (
    channel.type === ChannelType.GuildNewsThread ||
    channel.type === ChannelType.GuildPrivateThread ||
    channel.type === ChannelType.GuildPublicThread
  ) {
    threadData = {
      parentId: channel.parent_id,
      locked: channel.thread_metadata?.locked,
      type: channel.type,
    };
  }

  await checkSendMessagePossible({
    channelId,
    guildId: interaction.guild_id,
    instance,
    user: interaction.member,
    thread: threadData,
  });

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
        max_length: 2000,
        min_length: 1,
        required: true,
        custom_id: "content",
        short: false,
      }),
    ],
  });
}
