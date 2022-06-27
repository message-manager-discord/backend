import {
  APIApplicationCommandInteractionDataBooleanOption,
  APIApplicationCommandInteractionDataChannelOption,
  APIChatInputApplicationCommandGuildInteraction,
  ApplicationCommandOptionType,
  ChannelType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../../errors";
import { createMessageCacheKey } from "../../../lib/messages/cache";
import {
  checkSendMessagePossible,
  ThreadOptionObject,
} from "../../../lib/messages/send";
import { GuildSession } from "../../../lib/session";
import { InternalInteractionType } from "../../interaction";
import {
  createModal,
  createTextInputWithRow,
} from "../../modals/createStructures";
import { createInitialMessageGenerationEmbed } from "../../shared/message-generation";
import { InteractionReturnData } from "../../types";

export default async function handleSendCommand(
  internalInteraction: InternalInteractionType<APIChatInputApplicationCommandGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance
): Promise<InteractionReturnData> {
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
  const contentOnly: boolean =
    (
      interaction.data.options?.find(
        (option) =>
          option.name === "content-only" &&
          option.type === ApplicationCommandOptionType.Boolean
      ) as APIApplicationCommandInteractionDataBooleanOption
    )?.value ?? false;

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
    instance,
    thread: threadData,
    session,
  });
  if (contentOnly) {
    return createModal({
      title: `Sending a message to #${channel.name}`,
      custom_id: `send:${channelId}`,
      components: [
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
  const messageGenerationKey = createMessageCacheKey(interaction.id, channelId);
  const embedData = createInitialMessageGenerationEmbed(
    messageGenerationKey,
    {} // Empty as this is the start of the process
  );

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [embedData.embed],
      components: embedData.components,
      flags: MessageFlags.Ephemeral,
    },
  };
}
