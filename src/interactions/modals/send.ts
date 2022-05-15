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
import { sendMessage } from "../../lib/messages/send";
import { GuildSession } from "../../lib/session";
import { addTipToEmbed } from "../../lib/tips";
import { InternalInteractionType } from "../interaction";
import { InteractionReturnData } from "../types";
// Guild only
export default async function handleModalSend(
  internalInteraction: InternalInteractionType<APIModalSubmitGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  const channelId: string | undefined =
    interaction.data.custom_id.split(":")[1];

  if (!channelId) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.MODAL_CUSTOM_ID_MALFORMED,
      "No channel id on modal submit"
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

  const message = await sendMessage({
    channelId,
    content,
    instance,
    session,
  });

  const messageLink = `https://discord.com/channels/${interaction.guild_id}/${channelId}/${message.id}`;

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
