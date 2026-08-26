// Modal after send - from the chat input command
import type {
  APIEmbed,
  APIModalSubmitGuildInteraction,
} from "discord-api-types/v9";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v9";
import type { FastifyInstance } from "fastify";

import { embedPink } from "../../constants.js";
import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors.js";
import { sendMessage } from "../../lib/messages/send.js";
import type { GuildSession } from "../../lib/session/index.js";
import { addTipToEmbed } from "../../lib/tips/index.js";
import type { InternalInteractionType } from "../interaction.js";
import type { InteractionReturnData } from "../types.js";
import { getModalValue } from "./utils.js";
// This modal is guild only (check in interaction handler)
export default async function handleModalSend(
  internalInteraction: InternalInteractionType<APIModalSubmitGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance,
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  const channelId: string | undefined =
    interaction.data.custom_id.split(":")[1]; // Get channel id from custom_id

  if (!channelId) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.MODAL_CUSTOM_ID_MALFORMED,
      "No channel id on modal submit",
    );
  }

  // Find content component
  const content = getModalValue(interaction.data.components, "content");

  if (content === undefined) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.MODAL_SUBMIT_MISSING_REQUIRED_INPUT,
      "No content on modal submit",
    );
  }

  // Send message via bot
  const message = await sendMessage({
    channelId,
    content,
    instance,
    session,
  });

  const messageLink = `https://discord.com/channels/${interaction.guild_id}/${channelId}/${message.id}`;

  // Return embed
  const embed: APIEmbed = {
    color: embedPink,
    title: "Message Sent",
    description: `Message sent! [Jump to message](${messageLink})`,
    url: messageLink,
    timestamp: new Date().toISOString(),
  };

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [addTipToEmbed(embed)],
      flags: MessageFlags.Ephemeral,
    },
  };
}
