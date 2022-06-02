import {
  APIEmbed,
  APIModalSubmitGuildInteraction,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import { embedPink } from "../../constants";
import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors";
import { editMessage } from "../../lib/messages/edit";
import { GuildSession } from "../../lib/session";
import { addTipToEmbed } from "../../lib/tips";
import { InternalInteractionType } from "../interaction";
import { InteractionReturnData } from "../types";

export default async function handleModalEdit(
  internalInteraction: InternalInteractionType<APIModalSubmitGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  const messageId: string | undefined =
    interaction.data.custom_id.split(":")[1]; // TODO: Include the channel id in the custom_id

  if (!messageId) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.MODAL_CUSTOM_ID_MALFORMED,
      "No message id on modal submit"
    );
  }

  const content = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "content"
  )?.components[0].value;

  if (content === undefined) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.MODAL_SUBMIT_MISSING_REQUIRED_INPUT,
      "No content on modal submit"
    );
  }
  if (interaction.channel_id === undefined) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.GENERIC_UNEXPECTED_FAILURE,
      "Missing channel_id on modal submit"
    ); // Not sure why this might happen
  }
  await editMessage({
    content,

    channelId: interaction.channel_id,
    instance,
    messageId,
    session,
  });
  const messageLink = `https://discord.com/channels/${interaction.guild_id}/${interaction.channel_id}/${messageId}`;

  const embed: APIEmbed = {
    color: embedPink,
    title: "Message Edited",
    description: `Message edited! [Jump to message](${messageLink})`,
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
