import { Static, Type } from "@sinclair/typebox";
import { FastifyInstance } from "fastify";
import httpErrors from "http-errors";

import {
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
} from "../../lib/reports";
import {
  ReportCloseStatusEnum,
  ReportListingModelType,
  ReportMessageHistoryResponseType,
  ReportMessageModelType,
  ReportModelType,
  ReportStatusRequest,
} from "../types/reports";
const { Forbidden, BadRequest } = httpErrors;

// TODO: Move actions away from status - ie just have a status of actioned and custom actions

const rootPath = "/reports";

const GetReportsQuerystring = Type.Object({
  status: Type.Optional(Type.Enum(ReportStatusRequest)),
  assigned_to: Type.Optional(Type.String()),
  guild: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  before: Type.Optional(Type.String()),
  staff_view: Type.Optional(Type.Boolean()),
});
type GetReportGuildsQuerystringType = Static<typeof GetReportsQuerystring>;

const GetMessageAbleToBeReportedQueryString = Type.Object({
  message_id: Type.String(),
  channel_id: Type.String(),
});

type GetMessageAbleToBeReportedQueryStringType = Static<
  typeof GetMessageAbleToBeReportedQueryString
>;

const CreateReportBody = Type.Object({
  message_id: Type.String(),
  channel_id: Type.String(),
  title: Type.String(),
  reason: Type.String(),
});

type CreateReportBodyType = Static<typeof CreateReportBody>;

const ReportParams = Type.Object({
  id: Type.String({ description: "The report id" }),
});
type ReportParamsType = Static<typeof ReportParams>;

const ReportMessageParams = Type.Object({
  id: Type.String({ description: "The report id" }),
  message_id: Type.String({ description: "The message id" }),
});
type ReportMessageParamsType = Static<typeof ReportMessageParams>;

const CreateReportMessageBody = Type.Object({
  content: Type.String(),
  staff_only: Type.Boolean(),
});

type CreateReportMessageBodyType = Static<typeof CreateReportMessageBody>;

const PUTAssignedUserBody = Type.Object({
  assigned_staff_id: Type.String(),
});

type PUTAssignedUserBodyType = Static<typeof PUTAssignedUserBody>;

const CloseReportBody = Type.Object({
  status: Type.Enum(ReportCloseStatusEnum),
  message_to_reporting_user: Type.String(),
  staff_report_reason: Type.String(),
});

type CloseReportBodyType = Static<typeof CloseReportBody>;

const MessageContextQuerystring = Type.Object({
  position: Type.Number(),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 10 })),
});

type MessageContextQuerystringType = Static<typeof MessageContextQuerystring>;

const ActionReportBody = Type.Object({
  guild_ban: Type.Object({
    ban: Type.Boolean(),
    length: Type.Optional(Type.Number()),
  }),
  user_ban_ids: Type.Array(
    Type.Object({
      id: Type.String(),
      length: Type.Optional(Type.Number()),
    })
  ),
  delete_message: Type.Boolean(),
  warning: Type.Boolean(),

  staff_report_reason: Type.String(),
  message_to_reporting_user: Type.String(),
  message_to_actioned: Type.String(),
});

type ActionReportBodyType = Static<typeof ActionReportBody>;

// Restricted report status when requesting

const verifyId = (id: string): true => {
  // Check if id is a valid bigint - if not throw error
  // This includes a check for non number (like characters eg "helloworld" is invalid)

  try {
    BigInt(id);
    return true;
  } catch (e) {
    throw new BadRequest("report id must be a valid bitint");
  }
};

// eslint-disable-next-line @typescript-eslint/require-await
const reportPlugin = async (instance: FastifyInstance) => {
  instance.addHook(
    "preHandler",
    instance.auth([instance.requireAuthentication])
  );

  // Get Reports

  instance.get<{
    Querystring: GetReportGuildsQuerystringType;
    Reply: ReportListingModelType;
  }>(
    `${rootPath}`,
    {
      config: { rateLimit: { max: 5, timeWindow: 5 * 1000 } }, // Effectively one request per second, but allows bursts of up to 5
      schema: {
        description: "Get list of reports",
        tags: ["reports"],
        querystring: GetReportsQuerystring,
        response: {
          200: {
            description: "OK",
            $ref: "models.reportList",
          },
          400: {
            description: "Bad Request",
            $ref: "responses.badRequest#",
          },
          401: {
            description: "Unauthorized",
            $ref: "responses.unauthorized#",
          },
          403: {
            description:
              "Forbidden - Missing privileges to view that type of reports",
            $ref: "responses.forbidden#",
          },
        },
      },
    },
    async (request) => {
      const { status, assigned_to, guild, limit, before, staff_view } =
        request.query;

      // Can be disabled as these routes are under authentication, and therefore will have a user
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const user = request.user!;

      // Check if staff_view is valid
      if (staff_view === true && !user.staff) {
        throw new Forbidden("Only staff may request the staff view");
      }
      let filterByUser: string | undefined;
      if (staff_view === false) {
        filterByUser = user.userId;
      }

      // If status is open then select all reports that have the status pending, assigned, spam, review
      // If closed then select all reports that have the status invalid, review, and actioned

      return await getReports({
        instance,
        filterStatus: status,
        assigned_to,
        filterByUser,
        guildId: guild,
        limit,
        before,
        staff: user.staff,
      });
    }
  );

  // Create Report

  instance.post<{
    Body: CreateReportBodyType;
  }>(
    `${rootPath}`,
    {
      config: { rateLimit: { max: 1, timeWindow: 30 * 1000 } },
      // Only allows one request every 30 seconds, as reports should not need to be created in quick succession
      schema: {
        description: "Create a report",
        tags: ["reports"],
        body: CreateReportBody,
        response: {
          200: {
            description: "OK",
            $ref: "models.report",
          },
          400: {
            description: "Bad Request",
            $ref: "responses.badRequest#",
          },
          401: {
            description: "Unauthorized",
            $ref: "responses.unauthorized#",
          },
        },
      },
    },
    async (request) => {
      const body = request.body;
      // Can be disabled as these routes are under authentication, and therefore will have a user
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const user = request.user!;
      return await createReport({
        title: body.title,
        messageId: body.message_id,
        channelId: body.channel_id,
        reason: body.reason,
        instance,
        userId: user.userId,
        staff: user.staff,
      });
    }
  );
  // Get Report
  instance.get<{ Params: ReportParamsType; Reply: ReportModelType }>(
    `${rootPath}/:id`,
    {
      config: { rateLimit: { max: 5, timeWindow: 5 * 1000 } }, // Effectively one request per second, but allows bursts of up to 5
      schema: {
        description: "Get a report",
        tags: ["reports"],
        params: ReportParams,
        response: {
          200: {
            description: "OK",
            $ref: "models.report",
          },

          400: {
            description: "Bad Request",
            $ref: "responses.badRequest#",
          },
          401: {
            description: "Unauthorized",
            $ref: "responses.unauthorized#",
          },
          403: {
            description: "Forbidden",
            $ref: "responses.forbidden#",
          },

          404: {
            description: "Not Found",
            $ref: "responses.notFound#",
          },
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      verifyId(id);
      // Can be disabled as these routes are under authentication, and therefore will have a user
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const user = request.user!;
      const staff = user.staff;
      return await getReport({
        instance,
        userId: user.userId,
        staff,
        reportId: id,
      });
    }
  );
  // Get Message Can Report
  instance.get<{
    Querystring: GetMessageAbleToBeReportedQueryStringType;
    Reply: boolean;
  }>(
    "/reports/can-report",
    {
      config: { ratelimit: { max: 10, timeWindow: 5 * 1000 } }, // Effectively one request per second, but allows bursts of up to 5
      schema: {
        description: "Check if a message can be reported",
        tags: ["reports"],
        querystring: GetMessageAbleToBeReportedQueryString,
        response: {
          200: {
            description: "OK",
            type: "boolean",
          },
          400: {
            description: "Bad Request",
            $ref: "responses.badRequest#",
          },
          401: {
            description: "Unauthorized",
            $ref: "responses.unauthorized#",
          },
        },
      },
    },
    async (request) => {
      const { message_id, channel_id } = request.query;
      return (
        (await checkMessageCanBeReported(channel_id, message_id, instance)) !==
        false
      );
    }
  );

  // Create Report Messages
  instance.post<{
    Params: ReportParamsType;
    Body: CreateReportMessageBodyType;
    Reply: ReportMessageModelType;
  }>(
    `${rootPath}/:id/messages`,
    {
      config: { ratelimit: { max: 1, timeWindow: 30 * 1000 } }, // One message sent per 30 seconds, as messages should not need to be sent in quick succession
      schema: {
        description: "Create a report message",
        tags: ["reports"],
        params: ReportParams,
        body: CreateReportMessageBody,
        response: {
          200: {
            description: "OK",
            $ref: "models.reportMessage",
          },
          400: {
            description: "Bad Request",
            $ref: "responses.badRequest#",
          },
          401: {
            description: "Unauthorized",
            $ref: "responses.unauthorized#",
          },
          403: {
            description: "Forbidden",
            $ref: "responses.forbidden#",
          },
          404: {
            description: "Not Found",
            $ref: "responses.notFound#",
          },
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      verifyId(id);
      const body = request.body;
      // Can be disabled as these routes are under authentication, and therefore will have a user
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const user = request.user!;
      return await createReportMessage({
        instance,
        user: {
          userId: user.userId,
          staff: user.staff,
        },
        reportId: id,
        content: body.content,
        staffOnly: body.staff_only,
      });
    }
  );

  // Get Report Message
  instance.get<{
    Params: ReportMessageParamsType;
    Reply: ReportMessageModelType;
  }>(
    `${rootPath}/:id/messages/:message_id`,
    {
      config: { ratelimit: { max: 5, timeWindow: 5 * 1000 } }, // Effectively one request per second, but allows bursts of up to 5
      schema: {
        description: "Get a report message",
        tags: ["reports"],
        params: ReportMessageParams,
        response: {
          200: {
            description: "OK",
            $ref: "models.reportMessage",
          },

          400: {
            description: "Bad Request",
            $ref: "responses.badRequest#",
          },
          401: {
            description: "Unauthorized",
            $ref: "responses.unauthorized#",
          },
          403: {
            description: "Forbidden",
            $ref: "responses.forbidden#",
          },

          404: {
            description: "Not Found",
            $ref: "responses.notFound#",
          },
        },
      },
    },
    async (request) => {
      const { id, message_id } = request.params;
      verifyId(id);
      verifyId(message_id);
      // Can be disabled as these routes are under authentication, and therefore will have a user
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const user = request.user!;
      const staff = user.staff;
      return await getReportMessage({
        instance,
        user: { userId: user.userId, staff },
        reportId: id,
        messageId: message_id,
      });
    }
  );

  // Assign report

  instance.put<{
    Params: ReportParamsType;
    Body: PUTAssignedUserBodyType;
    Reply: ReportModelType;
  }>(
    `${rootPath}/:id/assign`,
    {
      config: { ratelimit: { max: 1, timeWindow: 30 * 1000 } }, // Should only really be sent once ever for a route, so can be heavily rate limited
      schema: {
        description: "Assign a report to a staff member",
        tags: ["reports"],
        body: PUTAssignedUserBody,
        response: {
          200: {
            description: "OK",
            $ref: "models.report",
          },
          400: {
            description: "Bad Request",
            $ref: "responses.badRequest#",
          },
          401: {
            description: "Unauthorized",
            $ref: "responses.unauthorized#",
          },
          403: {
            description: "Forbidden",
            $ref: "responses.forbidden#",
          },
          404: {
            description: "Not Found",
            $ref: "responses.notFound#",
          },
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      verifyId(id);
      const { assigned_staff_id } = request.body;
      verifyId(assigned_staff_id);
      // Can be disabled as these routes are under authentication, and therefore will have a user
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const user = request.user!;
      const staff = user.staff;
      if (staff !== true) {
        throw new Forbidden("You are not a staff member");
      }
      if (assigned_staff_id !== user.userId && !user.admin) {
        throw new Forbidden("You cannot assign a report to another user");
      }

      return await assignReport({
        instance,
        reportId: id,
        assignedUserId: assigned_staff_id,
        adminUser: !!user.admin,
      });
    }
  );

  instance.post<{
    Params: ReportParamsType;
    Body: CloseReportBodyType;
    Reply: ReportModelType;
  }>(
    `${rootPath}/:id/close`,
    {
      config: { ratelimit: { max: 1, timeWindow: 30 * 1000 } }, // Should only really be sent once ever, so can be heavily rate limited
      schema: {
        description: "Close a report",
        tags: ["reports"],
        body: CloseReportBody,
        response: {
          200: {
            description: "OK",
            $ref: "models.report",
          },
          400: {
            description: "Bad Request",
            $ref: "responses.badRequest#",
          },
          401: {
            description: "Unauthorized",
            $ref: "responses.unauthorized#",
          },
          403: {
            description: "Forbidden",
            $ref: "responses.forbidden#",
          },
          404: {
            description: "Not Found",
            $ref: "responses.notFound#",
          },
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      verifyId(id);
      const { staff_report_reason, message_to_reporting_user, status } =
        request.body;
      // Can be disabled as these routes are under authentication, and therefore will have a user
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const user = request.user!;

      return await closeReport({
        instance,
        user,
        reportId: id,
        staffReportReason: staff_report_reason,
        messageToReportingUser: message_to_reporting_user,
        closeStatus: status,
      });
    }
  );

  instance.post<{
    Params: ReportParamsType;
    Body: ActionReportBodyType;
    Reply: ReportModelType;
  }>(
    `${rootPath}/:id/action`,
    {
      config: { ratelimit: { max: 1, timeWindow: 30 * 1000 } }, // Should only really be sent once ever, so can be heavily rate limited
      schema: {
        description: "Action a report",
        tags: ["reports"],
        body: ActionReportBody,
        response: {
          200: {
            description: "OK",
            $ref: "models.report",
          },
          400: {
            description: "Bad Request",
            $ref: "responses.badRequest#",
          },
          401: {
            description: "Unauthorized",
            $ref: "responses.unauthorized#",
          },
          403: {
            description: "Forbidden",
            $ref: "responses.forbidden#",
          },
          404: {
            description: "Not Found",
            $ref: "responses.notFound#",
          },
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      verifyId(id);
      request.body.user_ban_ids.forEach((user_id) => verifyId(user_id.id));
      // Can be disabled as these routes are under authentication, and therefore will have a user
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const user = request.user!;
      const report = await actionReport({
        instance,
        user,
        reportId: id,
        guildBan: request.body.guild_ban,
        userBanIds: request.body.user_ban_ids,
        staffReportReason: request.body.staff_report_reason,
        warning: request.body.warning,
        messageToReportingUser: request.body.message_to_reporting_user,
        messageToActioned: request.body.message_to_actioned,
        shouldDeleteMessage: request.body.delete_message,
      });
      return report;
    }
  );

  instance.get<{
    Params: ReportParamsType;
    Reply: ReportMessageHistoryResponseType;
    Querystring: MessageContextQuerystringType;
  }>(
    `${rootPath}/:id/history`,
    {
      config: { ratelimit: { max: 10, timeWindow: 5 * 1000 } }, // Might be clicked through pretty quickly when being used, allows for 10 per 5 seconds
      schema: {
        description: "Get the history of a report",
        tags: ["reports"],
        params: ReportParams,
        querystring: MessageContextQuerystring,
        response: {
          200: {
            description: "OK",
            $ref: "models.reportMessageHistoryResponse",
          },
          400: {
            description: "Bad Request",
            $ref: "responses.badRequest#",
          },
          401: {
            description: "Unauthorized",
            $ref: "responses.unauthorized#",
          },
          403: {
            description: "Forbidden",
            $ref: "responses.forbidden#",
          },
          404: {
            description: "Not Found",
            $ref: "responses.notFound#",
          },
        },
      },
    },
    async (request) => {
      // Can be disabled as these routes are under authentication, and therefore will have a user
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const user = request.user!;
      if (!user.staff) {
        throw new Forbidden("You are not a staff member");
      }
      const { id } = request.params;
      verifyId(id);
      const { position } = request.query;
      let { limit } = request.query;
      if (limit === undefined) limit = 10;
      return await getReportHistory({
        instance,
        reportId: id,
        position,
        limit,
        user,
      });
    }
  );
};

export default reportPlugin;

///TODO
// Add ratelimiting
// Make it so that actioning someone actually does something in the api (with minimal impact on performance)
// Investigate email
