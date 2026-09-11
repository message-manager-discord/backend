// Chat input send command
import type {
  APIApplicationCommandInteractionDataBooleanOption,
  APIApplicationCommandInteractionDataChannelOption,
  APIChatInputApplicationCommandGuildInteraction,
} from "discord-api-types/v9";
import {
  ApplicationCommandOptionType,
  ChannelType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import type { FastifyInstance } from "fastify";

import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../../errors.js";
import {
  createMessageCacheKey,
  saveMessageToCache,
} from "../../../lib/messages/cache.js";
import type { ThreadOptionObject } from "../../../lib/messages/send.js";
import { checkSendMessagePossible } from "../../../lib/messages/send.js";
import type { GuildSession } from "../../../lib/session/index.js";
import type { InternalInteractionType } from "../../interaction.js";
import {
  createModal,
  createTextInputWithRow,
} from "../../modals/createStructures.js";
import { createInitialMessageGenerationEmbed } from "../../shared/message-generation.js";
import type { InteractionReturnData } from "../../types.js";

export default async function handleSendCommand(
  internalInteraction: InternalInteractionType<APIChatInputApplicationCommandGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance,
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  // First option: Channel
  const channelId: string | undefined = (
    interaction.data.options?.find(
      (option) =>
        option.name === "channel" &&
        option.type === ApplicationCommandOptionType.Channel,
    ) as APIApplicationCommandInteractionDataChannelOption | undefined
  )?.value;
  const channel =
    channelId === undefined
      ? undefined
      : interaction.data.resolved?.channels?.[channelId];
  if (channelId === undefined || channelId === "") {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_MISSING_EXPECTED_OPTION,
      "No channel option on send command",
    );
  }
  if (channel === undefined) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_RESOLVED_MISSING_EXPECTED_VALUE,
      "Channel not found in resolved data",
    );
  }
  // Content only means a message generation flow will not be started and the content modal displayed immediately
  const contentOnly: boolean =
    (
      interaction.data.options?.find(
        (option) =>
          option.name === "content-only" &&
          option.type === ApplicationCommandOptionType.Boolean,
      ) as APIApplicationCommandInteractionDataBooleanOption | undefined
    )?.value ?? false;

  let threadData: undefined | ThreadOptionObject = undefined;

  if (
    channel.type === ChannelType.AnnouncementThread ||
    channel.type === ChannelType.PrivateThread ||
    channel.type === ChannelType.PublicThread
  ) {
    // Get thread data for message checks
    threadData = {
      parentId: channel.parent_id,
      locked: channel.thread_metadata?.locked,
      type: channel.type,
    };
  }

  // Check if the message can be sent - used as the message isn't sent at this step but shouldn't proceed
  // if permissions are not there
  await checkSendMessagePossible({
    channelId,
    instance,
    thread: threadData,
    session,
  });

  if (contentOnly) {
    // return modal
    return createModal({
      title: `Sending a message to ${
        channel.name !== null
          ? `#${
              channel.name.length > 23
                ? `${channel.name.substring(0, 20)}...`
                : channel.name
            }`
          : "Unknown Channel"
      }`,
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
  // start message generation flow
  const messageGenerationKey = createMessageCacheKey(interaction.id, channelId);
  await saveMessageToCache({ key: messageGenerationKey, data: {}, instance }); // Otherwise it'll return null when fetching and throw an error.
  const embedData = createInitialMessageGenerationEmbed(
    messageGenerationKey,
    {}, // Empty as this is the start of the process,
    interaction.guild_id,
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
