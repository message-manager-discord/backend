import {
  EmbedField,
  Guild,
  GuildBan,
  Message,
  MessageEmbed,
  Report,
  ReportActionLink,
  ReportMessage,
  ReportStatus,
  UserBan,
  Warning,
} from "@prisma/client";
import { Snowflake } from "discord-api-types/globals";
import { FastifyInstance } from "fastify";
import httpErrors from "http-errors";

import limits from "../limits";
import {
  Action,
  ReportCloseStatusEnum,
  ReportListingModelType,
  ReportMessageHistoryModelType,
  ReportMessageHistoryResponseType,
  ReportMessageModelType,
  ReportModelType,
  ReportStatusRequest,
} from "../v1/types/reports";
const { Forbidden, NotFound, BadRequest } = httpErrors;
import {
  GuildNotFound,
  GuildUnavailable,
  ShardInactive,
} from "redis-discord-cache/dist/errors";

import { UserRequestData } from "../plugins/authentication";
import { createStoredEmbedFromDataBaseEmbed } from "./messages/embeds/parser";

// TODO fix and use custom errors!!!

const checkMessageCanBeReported = async (
  channelId: Snowflake,
  messageId: Snowflake,
  instance: FastifyInstance
): Promise<Message | false> => {
  // First check if the message is in the database, and the latest message is not deleted
  const message = await instance.prisma.message.findFirst({
    where: {
      id: BigInt(messageId),
      channelId: BigInt(channelId),
      deleted: {
        not: true,
      },
    },
    orderBy: {
      editedAt: "desc",
    },
  });

  return message ?? false;
};

// TODO: Don't return sentsitive data to users

const createReportFromData = async (
  report: Report & {
    action:
      | (ReportActionLink & {
          warning: Warning | null;
          userBans: UserBan[];
        })
      | null;
    guild: Guild & {
      guildBans: GuildBan[];
      warnings: Warning[];
    };
    reportedMessageSnapshot: Message & {
      reports: Report[];
      embed: (MessageEmbed & { fields: EmbedField[] }) | null | undefined;
    };
    ReportMessages: ReportMessage[];
  },
  staff: boolean, // If staff only values should be included

  instance: FastifyInstance
): Promise<ReportModelType> => {
  // Staff only data is:
  // action
  // guild_data.past_warning_count
  // guild_data.past_appealed_ban_count
  // guild_data.banned
  // other_reports_on_same_message
  // if messages.staff_only - exclude
  // edit_count

  let extraGuildData: {
    icon?: string;
    name?: string;
    past_warning_count?: number;
    past_appealed_ban_count?: number;
    banned?: boolean;
  } = {};
  if (staff) {
    extraGuildData = {
      past_warning_count: report.guild.guildBans.length,
      past_appealed_ban_count: report.guild.guildBans.filter((ban) => {
        return (
          ban.appealed !== false ||
          (ban.expireAt !== null && ban.expireAt < new Date())
        );
      }).length,
      banned:
        report.guild.guildBans.find(
          (ban) =>
            ban.appealed === false &&
            (ban.expireAt === null || ban.expireAt > new Date())
        ) !== undefined,
    };
  }
  try {
    const guild = await instance.redisGuildManager.getGuild(
      report.guildId.toString()
    );
    extraGuildData.icon = await guild.icon;
    extraGuildData.name = await guild.name;
  } catch (error) {
    if (
      !(
        error instanceof GuildNotFound ||
        error instanceof GuildUnavailable ||
        error instanceof ShardInactive
      )
    ) {
      throw error;
    }
  }

  const editCount = staff
    ? await instance.prisma.message.count({
        where: {
          id: report.reportedMessageId,
        },
      })
    : undefined;

  const action: Action | undefined =
    report.action === null
      ? undefined
      : !staff
      ? undefined
      : report.action.guildBanId !== null
      ? Action.GUILD_BAN
      : report.action.userBans.length > 0
      ? Action.USER_BAN
      : report.action.warningId !== null
      ? report.action.warning?.type === "delete"
        ? Action.DELETE
        : Action.WARNING
      : undefined;

  const reportedMessage = {
    id: report.reportedMessageSnapshot.id.toString(),
    content: report.reportedMessageSnapshot.content ?? undefined,
    embed:
      report.reportedMessageSnapshot.embed !== undefined &&
      report.reportedMessageSnapshot.embed !== null
        ? createStoredEmbedFromDataBaseEmbed(
            report.reportedMessageSnapshot.embed
          )
        : undefined,
    author_id: staff
      ? report.reportedMessageSnapshot.editedBy.toString()
      : undefined,
    created_at: report.reportedMessageSnapshot.editedAt.toISOString(),
    edit_count: editCount,
  };

  const otherReports = staff
    ? report.reportedMessageSnapshot.reports.map((report) =>
        report.id.toString()
      )
    : undefined;
  let assignedStaffId = report.assignedStaffId?.toString();
  if (!staff && assignedStaffId !== undefined) {
    // Replace assigned staff id with staff's profile id
    const userData = await instance.prisma.user.findUnique({
      where: {
        id: BigInt(assignedStaffId),
      },
      include: {
        staffProfile: true,
      },
    });
    assignedStaffId = userData?.staffProfile?.id.toString() ?? "0";
  }
  return {
    id: report.id.toString(),
    title: report.title,
    status: report.status,
    reason: report.reason,
    action,
    reporting_user_id: report.reportingUserId.toString(),
    assigned_staff_id: assignedStaffId,
    guild_id: report.guildId.toString(),
    guild_data: extraGuildData,
    reported_message: reportedMessage,
    other_reports_on_same_message: otherReports,
    created_at: report.createdAt.toISOString(),
    updated_at: report.updatedAt.toISOString(),
    messages: report.ReportMessages.filter(
      (message) => !message.staffOnly || staff
    ).map((message) => createReportMessageFromData(message, staff)),
    staff_view: staff,
  };
};

const createReportMessageFromData = (
  message: ReportMessage,
  staff: boolean
): ReportMessageModelType => {
  return {
    id: message.id.toString(),
    content: message.content,
    author_id: message.authorId.toString(),
    staff_id: staff ? message.staffId?.toString() : undefined,
    created_at: message.createdAt.toISOString(),
    staff_only: message.staffOnly,
  };
};

const getReports = async ({
  instance,
  filterStatus,
  assigned_to,
  filterByUser,
  guildId,
  limit,
  skip,
  staff,
}: {
  instance: FastifyInstance;
  filterStatus?: ReportStatusRequest;
  assigned_to?: Snowflake;
  filterByUser?: Snowflake;
  guildId?: Snowflake;
  limit?: number;
  skip?: number;
  staff: boolean;
}): Promise<ReportListingModelType> => {
  const statusFilter: ReportStatus[] | undefined =
    filterStatus === undefined || filterStatus === null
      ? undefined
      : filterStatus === "open"
      ? ["pending"]
      : filterStatus === "closed"
      ? ["invalid", "actioned", "spam"]
      : filterStatus === "assigned"
      ? ["pending"] // As assigned is only for pending and review - and the assigned staff id will be set on closed reports
      : [filterStatus as ReportStatus];

  const assignedFilter =
    assigned_to !== undefined
      ? BigInt(assigned_to)
      : filterStatus === "assigned"
      ? { not: null }
      : undefined;
  const reports = await instance.prisma.report.findMany({
    where: {
      status: {
        in: statusFilter,
      },

      assignedStaffId: assignedFilter,

      ...(guildId !== undefined && { guildId: BigInt(guildId) }),
      ...(filterByUser !== undefined && { userId: BigInt(filterByUser) }),
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit ?? 25,
    skip: skip ?? 0,
    include: {
      guild: true,
      reportedMessageSnapshot: true,
      ReportMessages: true,
    },
  });
  const extraGuildData = await instance.redisGuildManager.getGuildIconsAndNames(
    reports.map((report) => report.guildId.toString())
  );

  return {
    reports: reports.map((report) => {
      let messageCount = 0;
      if (staff) {
        messageCount = report.ReportMessages.length;
      } else {
        messageCount = report.ReportMessages.filter(
          (message) => !message.staffOnly
        ).length;
      }
      // get data from extradata by guild id key
      const guildData = extraGuildData[report.guildId.toString()];

      return {
        id: report.id.toString(),
        title: report.title,
        status: report.status,
        reporting_user_id: report.reportingUserId.toString(),
        assigned_staff_id: report.assignedStaffId?.toString(),
        guild_id: report.guildId.toString(),
        guild_data: {
          icon: guildData?.icon ?? undefined,
          name: guildData?.name ?? undefined,
        },
        created_at: report.createdAt.toString(),
        updated_at: report.updatedAt.toString(),
        message_count: messageCount,
      };
    }),
    report_count: await instance.prisma.report.count({
      where: {
        status: {
          in: statusFilter,
        },
      },
    }),
    skipped: skip ?? 0,
  };
};

const createReport = async ({
  title,
  messageId,
  channelId,
  reason,
  instance,
  userId,
  staff,
}: {
  title: string;
  messageId: Snowflake;
  channelId: Snowflake;
  reason: string;
  instance: FastifyInstance;
  userId: Snowflake;
  staff: boolean;
}): Promise<ReportModelType> => {
  const message = await checkMessageCanBeReported(
    channelId,
    messageId,
    instance
  );
  // check limits
  if (title.length >= 35) {
    throw new BadRequest("Title must not be longer than 35 characters");
  }
  if (reason.length >= 2000) {
    throw new BadRequest("Reason not be more than 2000 characters");
  }
  if (message === false) {
    throw new Forbidden(
      "message specified cannot be reported or does not exist"
    );
  }

  // also check if this user has already reported this message
  const hasReported = await instance.prisma.report.findFirst({
    where: {
      reportedMessageId: message.id,
      reportingUserId: BigInt(userId),
    },
  });
  if (hasReported !== null) {
    throw new Forbidden("You have already reported this message");
  }
  // and check how many spam reports the user has had in the last month
  const spamReports = await instance.prisma.report.count({
    where: {
      reportingUserId: BigInt(userId),
      status: "spam",
      createdAt: {
        gte: new Date(new Date().getTime() - 1000 * 60 * 60 * 24 * 30),
      },
    },
  });
  if (spamReports > limits.MAX_MONTHLY_SPAM_REPORTS) {
    throw new Forbidden(
      "You are temporally banned from reporting messages, as you've made too many spam reports."
    );
  }

  const report = await instance.prisma.report.create({
    data: {
      title,
      reason,
      reportingUserId: BigInt(userId),
      guildId: message.guildId,
      reportedMessageId: message.id,
      reportedMessageSnapshotInternalId: message.internalId,
    },
    include: {
      guild: {
        include: {
          guildBans: true,
          warnings: true,
        },
      },
      action: {
        include: { warning: true, userBans: true },
      },
      reportedMessageSnapshot: {
        include: {
          reports: true,
          embed: {
            include: {
              fields: true,
            },
          },
        },
      },
      ReportMessages: true,
    },
  });
  await createReportMessage({
    instance,
    reportId: report.id.toString(),
    content: `Hi there!\nWe've received your report, and we'll take a look and get back to you as soon as possible.`,
    staffOnly: false,
    user: {
      userId: "0",
      staff: true,
    },
  });
  // TODO: Send email
  return await createReportFromData(report, staff, instance);
};

const getReport = async ({
  reportId,
  instance,
  userId,
  staff,
}: {
  reportId: string;
  instance: FastifyInstance;
  userId: Snowflake;
  staff: boolean;
}): Promise<ReportModelType> => {
  const report = await instance.prisma.report.findUnique({
    where: {
      id: BigInt(reportId),
    },
    include: {
      guild: {
        include: {
          guildBans: true,
          warnings: true,
        },
      },
      action: {
        include: { warning: true, userBans: true },
      },
      reportedMessageSnapshot: {
        include: {
          reports: true,
          embed: {
            include: {
              fields: true,
            },
          },
        },
      },
      ReportMessages: true,
    },
  });
  if (report === null) {
    throw new NotFound("report not found");
  }
  if (report.reportingUserId !== BigInt(userId) && !staff) {
    throw new Forbidden("you do not have permission to view this report");
  }
  return await createReportFromData(report, staff, instance);
};

const getReportMessage = async ({
  instance,
  reportId,
  messageId,
  user,
}: {
  instance: FastifyInstance;
  reportId: string;
  messageId: string;
  user: { userId: string; staff: boolean };
}): Promise<ReportMessageModelType> => {
  const message = await instance.prisma.reportMessage.findUnique({
    where: {
      id: BigInt(messageId),
    },
    include: {
      report: true,
    },
  });
  if (message === null || message.reportId !== BigInt(reportId)) {
    throw new NotFound("message not found");
  }

  // check if user authorized to access message
  if (message.report.reportingUserId !== BigInt(user.userId) && !user.staff) {
    throw new Forbidden("you do not have permission to view this report");
  }
  if (message.staffOnly && !user.staff) {
    throw new Forbidden("you do not have permission to view this report");
  }
  return createReportMessageFromData(message, user.staff);
};

const createReportMessage = async ({
  instance,
  reportId,
  content,
  staffOnly,
  user,
}: {
  instance: FastifyInstance;
  reportId: string;
  content: string;
  staffOnly: boolean;
  user: { userId: string; staff: boolean };
}): Promise<ReportMessageModelType> => {
  const report = await instance.prisma.report.findUnique({
    where: {
      id: BigInt(reportId),
    },
    include: {
      guild: {
        include: {
          guildBans: true,
          warnings: true,
        },
      },
      action: {
        include: { warning: true },
      },
      reportedMessageSnapshot: {
        include: {
          reports: true,
          embed: {
            include: {
              fields: true,
            },
          },
        },
      },
      ReportMessages: true,
    },
  });
  if (report === null) {
    throw new NotFound("report not found");
  }
  if (report.reportingUserId !== BigInt(user.userId) && !user.staff) {
    throw new Forbidden(
      "you do not have permission to send a message to this report"
    );
  }
  if (["invalid", "actioned", "spam"].includes(report.status)) {
    throw new Forbidden("this report is already closed");
  }
  if (staffOnly && !user.staff) {
    throw new Forbidden("you do not have permission send a staff only message");
  }
  let authorId = BigInt(user.userId);
  if (user.staff) {
    // rewrite authorId
    const userData = await instance.prisma.user.findUnique({
      where: {
        id: authorId,
      },
      include: {
        staffProfile: true,
      },
    });
    authorId = userData?.staffProfile?.id ?? 0n;
  }
  const message = await instance.prisma.reportMessage.create({
    data: {
      content,
      staffOnly,
      reportId: BigInt(reportId),
      authorId: authorId,
      staffId: user.staff ? BigInt(user.userId) : undefined,
    },
    include: { report: true },
  });
  return createReportMessageFromData(message, user.staff);
};

const assignReport = async ({
  instance,
  reportId,
  assignedUserId,
  adminUser,
}: {
  instance: FastifyInstance;
  reportId: string;
  assignedUserId: string;
  adminUser: boolean;
}): Promise<ReportModelType> => {
  const report = await instance.prisma.report.findUnique({
    where: {
      id: BigInt(reportId),
    },
    include: {
      guild: {
        include: {
          guildBans: true,
          warnings: true,
        },
      },
      action: {
        include: { warning: true },
      },
      reportedMessageSnapshot: {
        include: {
          reports: true,
          embed: {
            include: {
              fields: true,
            },
          },
        },
      },
      ReportMessages: true,
    },
  });
  if (report === null) {
    throw new NotFound("report not found");
  }
  if (report.assignedStaffId !== null && !adminUser) {
    throw new Forbidden("this report is already assigned");
  }
  if (report.assignedStaffId === BigInt(assignedUserId)) {
    throw new BadRequest("This report is already assigned to that user");
  }
  return await createReportFromData(
    await instance.prisma.report.update({
      where: {
        id: BigInt(reportId),
      },
      data: {
        assignedStaffId: BigInt(assignedUserId),
      },
      include: {
        guild: {
          include: {
            guildBans: true,
            warnings: true,
          },
        },
        action: {
          include: { warning: true, userBans: true },
        },
        reportedMessageSnapshot: {
          include: {
            reports: true,
            embed: {
              include: {
                fields: true,
              },
            },
          },
        },
        ReportMessages: true,
      },
    }),
    true, // must be staff
    instance
  );
};

const actionReport = async ({
  instance,
  user,
  reportId,
  guildBan,
  userBanIds,
  staffReportReason,
  messageToActioned,
  messageToReportingUser,
  warning,
  shouldDeleteMessage,
}: {
  instance: FastifyInstance;
  user: UserRequestData;
  reportId: string;
  guildBan: { ban: boolean; length?: number };
  userBanIds: { id: Snowflake; length?: number }[];
  warning: boolean;
  shouldDeleteMessage: boolean;
  staffReportReason: string;
  messageToActioned: string;
  messageToReportingUser: string;
}): Promise<ReportModelType> => {
  const report = await instance.prisma.report.findUnique({
    where: {
      id: BigInt(reportId),
    },
    include: {
      action: true,
    },
  });
  if (!user.staff) {
    throw new Forbidden("You do not have permission to close reports");
  }
  if (report === null) {
    throw new NotFound("report not found");
  }
  if (["invalid", "actioned", "spam"].includes(report.status)) {
    throw new Forbidden("this report is already closed");
  }

  if (messageToReportingUser !== undefined) {
    await createReportMessage({
      instance,
      reportId,
      content: messageToReportingUser,
      staffOnly: false,
      user: {
        userId: user.userId,
        staff: true,
      },
    });
  }
  if (staffReportReason !== undefined) {
    await createReportMessage({
      instance,
      reportId,
      content: staffReportReason,
      staffOnly: true,
      user: {
        userId: user.userId,
        staff: true,
      },
    });
  }

  const updatedReport = await instance.prisma.report.update({
    where: {
      id: BigInt(reportId),
    },
    data: {
      status: "actioned",
      closeStaffId: BigInt(user.userId),
      action: {
        create: {
          ...(guildBan?.ban && {
            guildBan: {
              create: {
                guild: {
                  connectOrCreate: {
                    where: {
                      id: BigInt(report.guildId),
                    },

                    create: {
                      id: BigInt(report.guildId),
                    },
                  },
                },
                message: messageToActioned,
                expireAt:
                  guildBan.length !== undefined
                    ? new Date(Date.now() + guildBan.length * 1000)
                    : undefined,
                reason: staffReportReason,
              },
            },
          }),
          ...(userBanIds.length > 0 && {
            userBans: {
              create: userBanIds.map((ban) => ({
                userId: BigInt(ban.id),
                message: messageToActioned,
                expireAt:
                  ban.length !== undefined
                    ? new Date(Date.now() + ban.length * 1000)
                    : undefined,

                reason: staffReportReason,
              })),
            },
          }),
          ...(warning && {
            warning: {
              create: {
                guildId: report.guildId,
                message: messageToActioned,
                reason: staffReportReason,
                type: shouldDeleteMessage ? "delete" : "warning",
              },
            },
          }),
        },
      },
    },
    include: {
      guild: {
        include: {
          guildBans: true,
          warnings: true,
        },
      },
      action: {
        include: { warning: true, userBans: true },
      },
      reportedMessageSnapshot: {
        include: {
          reports: true,
          embed: {
            include: {
              fields: true,
            },
          },
        },
      },
      ReportMessages: true,
    },
  });
  return createReportFromData(updatedReport, true, instance);
};

const closeReport = async ({
  instance,
  user,
  reportId,
  staffReportReason,
  messageToReportingUser,
  closeStatus,
}: {
  instance: FastifyInstance;
  user: UserRequestData;
  reportId: string;
  staffReportReason: string;
  messageToReportingUser: string;
  closeStatus: ReportCloseStatusEnum;
}) => {
  // There are a couple of restrictions on closing a report
  // The report must be not closed
  // If the report is currently in an "admin review" state, only admins may close it
  // Only staff may close reports
  // When closing a report the staff may optionally provide a private reason

  const report = await instance.prisma.report.findUnique({
    where: {
      id: BigInt(reportId),
    },
    include: {
      action: true,
    },
  });
  if (!user.staff) {
    throw new Forbidden("You do not have permission to close reports");
  }
  if (report === null) {
    throw new NotFound("report not found");
  }
  if (["invalid", "actioned", "spam"].includes(report.status)) {
    throw new Forbidden("this report is already closed");
  }

  await createReportMessage({
    instance,
    reportId,
    content: messageToReportingUser,
    staffOnly: false,
    user: {
      userId: user.userId,
      staff: user.staff,
    },
  });

  if (staffReportReason !== undefined) {
    await createReportMessage({
      instance,
      reportId,
      content: staffReportReason,
      staffOnly: true,
      user: {
        userId: user.userId,
        staff: user.staff,
      },
    });
  }

  const updatedReport = await instance.prisma.report.update({
    where: {
      id: BigInt(reportId),
    },
    data: {
      status: closeStatus,
      closeStaffId: BigInt(user.userId),
    },
    include: {
      guild: {
        include: {
          guildBans: true,
          warnings: true,
        },
      },
      action: {
        include: { warning: true, userBans: true },
      },
      reportedMessageSnapshot: {
        include: {
          reports: true,
          embed: {
            include: {
              fields: true,
            },
          },
        },
      },
      ReportMessages: true,
    },
  });
  return createReportFromData(updatedReport, true, instance);
};

const getReportHistory = async ({
  instance,
  reportId,
  user,
  position,
  limit,
}: {
  instance: FastifyInstance;
  reportId: string;
  user: UserRequestData;
  position: number;
  limit: number;
}): Promise<ReportMessageHistoryResponseType> => {
  // If position is positive then we are getting the edited history of the reported message after the report
  // If it is negative then it is the history of the report message before the report
  // This does not include the exact reported message
  if (position === 0) {
    throw new BadRequest("Position cannot be 0");
  }
  const report = await instance.prisma.report.findUnique({
    where: {
      id: BigInt(reportId),
    },
    include: {
      reportedMessageSnapshot: true,
    },
  });
  if (report === null) {
    throw new NotFound("report not found");
  }
  if (!user.staff) {
    throw new Forbidden(
      "You do not have permission to view report message history"
    );
  }
  const reportMessageHistory = await instance.prisma.message.findMany({
    where: {
      id: report.reportedMessageId,
    },
    cursor: {
      internalId: report.reportedMessageSnapshot.internalId,
    },
    orderBy: {
      editedAt: "asc",
    },
    include: {
      embed: {
        include: {
          fields: true,
        },
      },
    },
    skip: Math.abs(position),
    // take is negative when looking back
    take: position < 0 ? -limit : limit,
  });
  const totalMessageHistoryBeforeOrAfter = await instance.prisma.message.count({
    where: {
      id: report.reportedMessageId,
      internalId: {
        [position < 0 ? "lt" : "gt"]: report.reportedMessageSnapshot.internalId,
      },
    },
  });
  const isMore = totalMessageHistoryBeforeOrAfter > Math.abs(position) + limit;

  const entries: ReportMessageHistoryModelType[] = reportMessageHistory.map(
    (message): ReportMessageHistoryModelType => ({
      id: message.id.toString(),
      content: message.content ?? undefined,
      embed:
        message.embed !== undefined && message.embed !== null
          ? createStoredEmbedFromDataBaseEmbed(message.embed)
          : undefined,
      acting_user_id: message.editedBy.toString(),
      edited_at: message.editedAt.toISOString(),
    })
  );

  return {
    entries,
    more: isMore,
  };
};

export {
  actionReport,
  assignReport,
  checkMessageCanBeReported,
  closeReport,
  createReport,
  createReportMessage,
  getReport,
  getReportHistory,
  getReportMessage,
  getReports,
};
