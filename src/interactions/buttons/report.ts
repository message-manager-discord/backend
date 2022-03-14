import prismaClient from "@prisma/client";
const { ReportStatus } = prismaClient;
import {
  APIInteractionResponse,
  APIMessageComponentGuildInteraction,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import { ExpectedFailure, InteractionOrRequestFinalStatus } from "../../errors";
import limits from "../../limits";

import { InternalInteraction } from "../interaction";
import {
  createModal,
  createTextInputWithRow,
} from "../modals/createStructures";

export default async function handleReportButton(
  internalInteraction: InternalInteraction<APIMessageComponentGuildInteraction>,
  instance: FastifyInstance
): Promise<APIInteractionResponse> {
  const interaction = internalInteraction.interaction;
  const messageId: string | undefined =
    interaction.data.custom_id.split(":")[1];
  const reportFromDate = new Date();
  reportFromDate.setMonth(reportFromDate.getMonth() - 1);
  const spamReportsLastMonth = await instance.prisma.report.count({
    where: {
      AND: {
        userId: BigInt(interaction.member.user.id),
        status: ReportStatus.Spam,
        reportedAt: { gt: reportFromDate },
      },
    },
  });

  if (spamReportsLastMonth >= limits.MAX_MONTHLY_SPAM_REPORTS) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MAX_SPAM_REPORTS_PER_MONTH_REACHED,
      "You have submitted to many reports that were deemed to be spam in the last month."
    ); // TODO: Add potential appeal process
  }
  const sameMessageAndUserReport = await instance.prisma.report.count({
    where: {
      AND: {
        userId: BigInt(interaction.member.user.id),
        messageId: BigInt(messageId),
        status: { in: [ReportStatus.Pending, ReportStatus.Open] }, // Checking for open reports
      },
    },
  });
  if (sameMessageAndUserReport > 0) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.REPORT_ALREADY_SUBMITTED,
      "You have already submitted a report for this message."
    );
  }
  return createModal({
    title: `Submit a message report`,
    custom_id: interaction.data.custom_id,
    components: [
      createTextInputWithRow({
        label: "Reason for report",
        placeholder:
          "Describe why this message should be removed. See /faq reporting for more information.",
        custom_id: "reason",
        short: false,
        required: true,
        max_length: 4000,
        min_length: 10,
      }),
    ],
  });
}
