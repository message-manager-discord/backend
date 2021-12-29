import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Forbidden } from "http-errors";
import { Static, Type } from "@sinclair/typebox";
import { CommandUsageAnalytics, CommandStatus } from "@prisma/client";

const CommandUsageAnalytics = Type.Array(
  Type.Object({
    guildId: Type.Optional(Type.String()),
    timestamp: Type.Number(),
    commandName: Type.Array(Type.String()),
    slash: Type.Boolean(),
    success: Type.Enum(CommandStatus),
  })
);

const GetAnalyticsQuerystring = Type.Object({
  after: Type.Optional(Type.Number()),
});

type GetAnalyticsQuerystringType = Static<typeof GetAnalyticsQuerystring>;

const addPlugin = async (instance: FastifyInstance) => {
  instance.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      // TO DO AUTHORIZATION
    }
  );

  instance.get<{ Querystring: GetAnalyticsQuerystringType }>(
    "/analytics",
    {
      schema: {
        querystring: GetAnalyticsQuerystring,
        response: {
          200: CommandUsageAnalytics,
        },
      },
    },
    async (request, reply) => {
      const { after: afterSeconds } =
        request.query as GetAnalyticsQuerystringType;
      let where = {};
      if (afterSeconds) {
        const afterMilliseconds = afterSeconds * 1000;
        where = {
          timestamp: {
            gt: new Date(afterMilliseconds).toISOString(),
          },
        };
      }
      let commandAnalytics =
        await instance.prisma.commandUsageAnalytics.findMany({
          take: 1000,
          where,
        });
      const parsedCommandAnalytics = commandAnalytics.map((entry) => {
        return {
          ...entry,
          timestamp: Math.floor(entry.timestamp.getTime() / 1000),
        };
      });
      return parsedCommandAnalytics;
    }
  );
};

export default addPlugin;
