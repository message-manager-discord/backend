// Currently not implemented - the modal is not generated
// Code kept for future use
import prismaClient from "@prisma/client";
const { ReportStatus } = prismaClient;
import {
  APIModalSubmitGuildInteraction,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors";
import { GuildSession } from "../../lib/session";
import { InternalInteractionType } from "../interaction";
import { InteractionReturnData } from "../types";

export default async function handleModalReport(
  internalInteraction: InternalInteractionType<APIModalSubmitGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  const messageId: string | undefined =
    interaction.data.custom_id.split(":")[1];

  if (!messageId) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.MODAL_CUSTOM_ID_MALFORMED,
      "No message id on modal submit"
    );
  }
  const storedMessage = await instance.prisma.message.findFirst({
    where: { id: BigInt(messageId) },

    orderBy: { editedAt: "desc" },
  });

  if (!storedMessage) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.MODAL_CUSTOM_ID_MALFORMED,
      "No message found on modal submit"
    );
  }

  const reason = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "reason"
  )?.components[0].value;

  if (reason === undefined) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.MODAL_SUBMIT_MISSING_REQUIRED_INPUT,
      "No reason on modal submit"
    );
  }

  await instance.prisma.report.create({
    data: {
      userId: BigInt(interaction.member.user.id),
      content: storedMessage.content ?? "",
      reportedAt: new Date(),
      guildId: storedMessage.guildId,
      channelId: storedMessage.channelId,
      messageId: storedMessage.id,
      userReportReason: reason,
      status: ReportStatus.Spam,
    },
  });
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: "Report submitted to bot moderators",
      flags: MessageFlags.Ephemeral,
    },
  };
}
