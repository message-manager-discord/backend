import { ReportStatus } from "@prisma/client";
import { Static, Type } from "@sinclair/typebox";

const EmbedField = Type.Object({
  name: Type.String(),
  value: Type.String(),
  inline: Type.Optional(Type.Boolean()),
});

const EmbedAuthor = Type.Object({
  name: Type.String(),
  url: Type.Optional(Type.String()),
  icon_url: Type.Optional(Type.String()),
});

const EmbedFooter = Type.Object({
  text: Type.String(),
  icon_url: Type.Optional(Type.String()),
});

const EmbedThumbnail = Type.Object({
  url: Type.String(),
});

const EmbedModel = Type.Object({
  title: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  url: Type.Optional(Type.String()),
  color: Type.Optional(Type.Integer()),
  timestamp: Type.Optional(Type.String()),
  author: Type.Optional(EmbedAuthor),
  footer: Type.Optional(EmbedFooter),
  thumbnail: Type.Optional(EmbedThumbnail),
  fields: Type.Optional(Type.Array(EmbedField)),
});

const ReportMessageModel = Type.Object(
  {
    id: Type.String({ examples: ["123456789012345678"] }),
    content: Type.String({ examples: ["Hello world"] }),
    author_id: Type.String({ examples: ["123456789012345678"] }),
    created_at: Type.String({ examples: ["2021-01-01T00:00:00.000Z"] }),
    staff_only: Type.Optional(Type.Boolean({ examples: [false] })),
  },
  { $id: "models.reportMessage" }
);

type ReportMessageModelType = Static<typeof ReportMessageModel>;

enum ReportStatusRequest {
  PENDING = "pending",
  ASSIGNED = "assigned",
  SPAM = "spam",
  INVALID = "invalid",
  ACTIONED = "actioned",
  OPEN = "open",
  CLOSED = "closed",
}

const ReportStatusEnum = Type.Enum(ReportStatus, { $id: "enums.reportStatus" });

enum ReportCloseStatusEnum {
  INVALID = "invalid",
  SPAM = "spam",
}

enum Action {
  GUILD_BAN = "guild_ban",
  USER_BAN = "user_ban",
  WARNING = "warning",
  DELETE = "delete",
}

const ActionEnum = Type.Enum(Action, { $id: "enums.action" });

const ReportModel = Type.Object(
  {
    id: Type.String({ examples: ["123456789012345678"] }),
    title: Type.String({ examples: ["Hello world"] }),
    status: ReportStatusEnum,
    action: Type.Optional(ActionEnum), // Staff Only
    reason: Type.String({ examples: ["Hello world"] }),
    reporting_user_id: Type.String({ examples: ["123456789012345678"] }),
    assigned_staff_id: Type.Optional(
      Type.String({ examples: ["123456789012345678"] })
    ),
    guild_id: Type.String({ examples: ["123456789012345678"] }),
    messages: Type.Array(ReportMessageModel),
    created_at: Type.String({ examples: ["2021-01-01T00:00:00.000Z"] }),
    updated_at: Type.String({ examples: ["2021-01-01T00:00:00.000Z"] }),
    guild_data: Type.Object({
      icon: Type.Optional(
        Type.String({ examples: ["b09d7fd2ec0f27e29d000f4fd62d8ea5"] })
      ),
      name: Type.Optional(Type.String({ examples: ["Example"] })),
      past_warning_count: Type.Optional(Type.Number({ examples: [0] })), // Staff Only
      past_appealed_ban_count: Type.Optional(Type.Number({ examples: [0] })), // Staff Only
      banned: Type.Optional(Type.Boolean({ examples: [false] })), // Staff Only
    }),
    reported_message: Type.Object({
      id: Type.String({ examples: ["123456789012345678"] }),
      content: Type.Optional(Type.String({ examples: ["Hello world"] })),
      embed: Type.Optional(EmbedModel),
      author_id: Type.String({ examples: ["123456789012345678"] }),
      created_at: Type.String({ examples: ["2021-01-01T00:00:00.000Z"] }),
      edit_count: Type.Number({ examples: [0] }),
    }),
    other_reports_on_same_message: Type.Optional(Type.Array(Type.String())), // Staff Only
  },
  { $id: "models.report" }
);

type ReportModelType = Static<typeof ReportModel>;

const ReportListingModel = Type.Array(
  Type.Object({
    id: Type.String({ examples: ["123456789012345678"] }),
    title: Type.String({ examples: ["Hello world"] }),
    status: ReportStatusEnum,
    reporting_user_id: Type.String({ examples: ["123456789012345678"] }),
    assigned_staff_id: Type.Optional(
      Type.String({ examples: ["123456789012345678"] })
    ),
    guild_id: Type.String({ examples: ["123456789012345678"] }),
    created_at: Type.String({ examples: ["2021-01-01T00:00:00.000Z"] }),
    updated_at: Type.String({ examples: ["2021-01-01T00:00:00.000Z"] }),

    message_count: Type.Number({ examples: [1] }), // The value changes depending on if the user is staff or not
  }),
  { $id: "models.reportList" }
);

type ReportListingModelType = Static<typeof ReportListingModel>;

const ReportSurroundingContextModel = Type.Object(
  {
    id: Type.String({ examples: ["123456789012345678"] }),
    content: Type.String({ examples: ["Hello world"] }),
    last_acting_user_id: Type.String({ examples: ["123456789012345678"] }),
    created_at: Type.String({ examples: ["2021-01-01T00:00:00.000Z"] }),
    edited_at: Type.String({ examples: ["2021-01-01T00:00:00.000Z"] }),
    more: Type.Boolean({ examples: [false] }),
  },
  { $id: "models.reportSurroundingContext" }
);

type ReportSurroundingContextModel = Static<
  typeof ReportSurroundingContextModel
>;

const ReportMessageHistoryModel = Type.Object(
  {
    id: Type.String({ examples: ["123456789012345678"] }),
    content: Type.Optional(Type.String({ examples: ["Hello world"] })),
    embed: Type.Optional(EmbedModel),
    acting_user_id: Type.String({ examples: ["123456789012345678"] }),
    edited_at: Type.String({ examples: ["2021-01-01T00:00:00.000Z"] }),
  },
  { $id: "models.reportMessageHistory" }
);

type ReportMessageHistoryModelType = Static<typeof ReportMessageHistoryModel>;

const ReportMessageHistoryResponse = Type.Object(
  {
    entries: Type.Array(ReportMessageHistoryModel),
    more: Type.Boolean({ examples: [false] }),
  },
  {
    $id: "models.reportMessageHistoryResponse",
  }
);

type ReportMessageHistoryResponseType = Static<
  typeof ReportMessageHistoryResponse
>;

export const reportSchemas = [
  ReportMessageModel,
  ReportStatusEnum,
  ReportModel,
  ReportListingModel,
  ReportSurroundingContextModel,
  ReportMessageHistoryModel,
  ReportMessageHistoryResponse,
];

export type {
  ReportListingModel,
  ReportListingModelType,
  ReportMessageHistoryModel,
  ReportMessageHistoryModelType,
  ReportMessageHistoryResponseType,
  ReportMessageModelType,
  ReportModelType,
  ReportSurroundingContextModel,
};

export { Action, ReportCloseStatusEnum, ReportStatusRequest };
