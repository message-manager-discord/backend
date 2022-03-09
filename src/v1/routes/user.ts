import { Type, Static } from "@sinclair/typebox";
import httpErrors from "http-errors";
const { Forbidden, NotFound } = httpErrors;
import { FastifyInstance } from "fastify";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";

import { UserRequestData } from "../../plugins/authentication";
import { Permissions } from "../../consts";
const rootPath = "/user";

const UserParams = Type.Object({
  id: Type.String({ description: "The user's id, `@me` for the current user" }),
});
type UserParamsType = Static<typeof UserParams>;
const PatchUserBody = Type.Object({
  staff: Type.Boolean(),
});
type PatchUserBodyType = Static<typeof PatchUserBody>;

const GetUserGuildsQuerystring = Type.Object({
  include_disconnected: Type.Optional(
    Type.Boolean({ description: "Include disconnected guilds" })
  ),
});
type GetUserGuildsQuerystringType = Static<typeof GetUserGuildsQuerystring>;

const userPlugin = async (instance: FastifyInstance) => {
  instance.addHook(
    "preHandler",
    instance.auth([instance.requireAuthentication])
  );

  instance.get<{ Params: UserParamsType }>(
    `${rootPath}/:id`,
    {
      schema: {
        description: "Get user information",
        tags: ["user"],
        security: [{ apiKey: [] }],
        params: UserParams,
        response: {
          200: {
            description: "OK",
            $ref: "models.user#",
          },
          401: {
            description: "Unauthorized",
            $ref: "responses.unauthorized#",
          },
          403: {
            description:
              "Forbidden - Missing staff privileges to access other users",
            $ref: "responses.forbidden#",
          },
          404: {
            description: "Not Found - User needs to log in",
            $ref: "responses.notfound#",
          },
        },
      },
    },
    async (request, reply) => {
      const requestUser = request.user!;
      const userId = request.params.id;
      let user: UserRequestData;
      if (userId === "@me") {
        user = requestUser;
      } else {
        if (!requestUser.staff) {
          reply.send(
            new Forbidden("You don't have permission to get other users")
          );
          return;
        }
        const userStored = await instance.prisma.user.findUnique({
          where: { id: BigInt(userId) },
        });
        if (!userStored || !userStored.oauthToken) {
          reply.send(new NotFound("User not found"));
          return;
        }
        user = {
          userId: userStored.id.toString(),
          token: userStored.oauthToken,
          staff: userStored.staff,
        };
      }

      const userInfo = await instance.discordOauthRequests.fetchUser(user);

      return {
        id: userInfo.id,
        username: userInfo.username,
        avatar: userInfo.avatar,
        discriminator: userInfo.discriminator,
        accent_color: userInfo.accent_color,
        staff: user.staff,
      };
    }
  );
  instance.patch<{
    Params: UserParamsType;
    Body: PatchUserBodyType;
  }>(
    `${rootPath}/:id`,
    {
      schema: {
        description: "Update a user - requires staff privileges",
        tags: ["user"],
        security: [{ apiKey: [] }],
        body: PatchUserBody,
        params: UserParams,
        response: {
          204: { description: "No Content - Successful update", type: "null" },
          401: {
            description: "Unauthorized",
            $ref: "responses.unauthorized#",
          },
          403: {
            description: "Forbidden - Missing staff privileges",
            $ref: "responses.forbidden#",
          },
          404: {
            description: "Not Found - User needs to log in",
            $ref: "responses.notfound#",
          },
        },
      },
    },
    async (request, reply) => {
      const requestUser = request.user!;
      const userId = request.params.id;
      if (userId === "@me") {
        reply.send(new Forbidden("You can't edit your own user"));
      }

      if (!requestUser.staff) {
        reply.send(new Forbidden("You don't have permission to edit users"));
      }

      try {
        await instance.prisma.user.update({
          data: { staff: request.body.staff },
          where: { id: BigInt(userId) },
        });
      } catch (e) {
        if (e instanceof PrismaClientKnownRequestError) {
          reply.send(new NotFound("User not found"));
        }
      }
      reply.send(204);
    }
  );
  instance.get<{
    Params: UserParamsType;
    Querystring: GetUserGuildsQuerystringType;
  }>(
    `${rootPath}/@me/guilds`,
    {
      schema: {
        description:
          "Get user's mutual guilds - only for own guilds, filtered by connected or user has the `MANAGE_SERVER` discord permission",
        tags: ["user"],
        security: [{ apiKey: [] }],
        querystring: GetUserGuildsQuerystring,
        response: {
          200: {
            description: "OK",
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                icon: { type: "string" },
                permissions: { type: "string" },
                connected: {
                  type: "boolean",
                  description:
                    "If the bot account has been added to this guild",
                },
              },
            },
          },
          401: {
            description: "Unauthorized",
            $ref: "responses.unauthorized#",
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user!;
      const guilds = await instance.discordOauthRequests.fetchUserGuilds(user);
      const filteredGuilds = [];
      for (const guild of guilds) {
        try {
          await instance.redisGuildManager.getGuild(guild.id).name; // Test if the guild is in cache, if it's not the getter will throw
          filteredGuilds.push({
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            permissions: guild.permissions,
            connected: true,
          });
        } catch (e) {
          if (
            request.query.include_disconnected &&
            ((BigInt(guild.permissions) & Permissions.MANAGE_GUILD) ===
              Permissions.MANAGE_GUILD ||
              (BigInt(guild.permissions) & Permissions.ADMINISTRATOR) ===
                Permissions.ADMINISTRATOR ||
              guild.owner)
          ) {
            filteredGuilds.push({
              id: guild.id,
              name: guild.name,
              icon: guild.icon,
              permissions: guild.permissions,
              connected: false,
            });
          }
        }
      }

      return filteredGuilds;
    }
  );
};

export default userPlugin;
