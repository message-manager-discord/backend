/**
 * Routes to access various user data and edit some user data
 */

import { Static, Type } from "@sinclair/typebox";
import httpErrors from "http-errors";
const { Forbidden, NotFound, BadRequest } = httpErrors;
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { FastifyInstance } from "fastify";

import { DiscordPermissions } from "../../consts";
import { UserRequestData } from "../../plugins/authentication";
import { errors401to404ResponseSchema } from "../types";
const rootPath = "/users";

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

// eslint-disable-next-line @typescript-eslint/require-await
const userPlugin = async (instance: FastifyInstance) => {
  // Authorization is handled by the authentication plugin - this will throw FORBIDDEN if the user is not authorized
  instance.addHook(
    "preHandler",
    instance.auth([instance.requireAuthentication])
  );

  // Get a user - only staff members may provide an id other than @me
  instance.get<{ Params: UserParamsType }>(
    `${rootPath}/:id`,
    {
      config: { ratelimit: { max: 9, timeWindow: 3 * 1000 } },
      // This route can be called pretty often by the website, so allows for more than other, 3/second with allowing for bursts up to 9
      // Also shorter time window so resets more often
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
            $ref: "responses.notFound#",
          },
        },
      },
    },
    async (request) => {
      // Request.user must be present since the require authentication plugin is used
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const requestUser = request.user!;
      const userId = request.params.id;
      let user: UserRequestData;
      if (userId === "@me") {
        user = requestUser;
      } else {
        if (!requestUser.staff) {
          throw new Forbidden("You don't have permission to get other users");
        }

        if (!/^\d+$/.test(userId)) {
          // test for number
          throw new BadRequest("Invalid user id");
        }
        const userStored = await instance.prisma.user.findUnique({
          where: { id: BigInt(userId) },
        });
        // oauthToken is also required for the user to be considered valid - if it is not present the user cannot be fetched
        if (!userStored || userStored.oauthToken === null) {
          throw new NotFound("User not found");
        }
        user = {
          userId: userStored.id.toString(),
          token: userStored.oauthToken,
          staff: userStored.staff,
          admin: instance.envVars.API_ADMIN_IDS.includes(
            userStored.id.toString()
          )
            ? true
            : undefined,
        };
      }

      // User data returned is more than what is stored - as data that may change
      // ie usernames / avatars are returned and must be fetched again
      // However as discordOauthRequests is cached this route being hit often will not cause a ratelimit issue
      // TODO: check what happens when token i sinvalid
      const userInfo = await instance.discordOauthRequests.fetchUser(user);
      // save hash to cache
      await instance.redisCache.setUserData(userInfo.id, {
        avatar:
          userInfo.avatar !== null
            ? `https://cdn.discordapp.com/avatars/${userInfo.id}/${userInfo.avatar}.png`
            : null,
        discriminator: userInfo.discriminator,
        username: userInfo.username,
      });

      return {
        id: userInfo.id,
        username: userInfo.username,
        avatar: userInfo.avatar,
        discriminator: userInfo.discriminator,
        accent_color: userInfo.accent_color,
        staff: user.staff,
        admin: user.admin,
      };
    }
  );
  // Edit a user - only staff members may do this. The only thing that can be edited is the staff field
  instance.patch<{
    Params: UserParamsType;
    Body: PatchUserBodyType;
  }>(
    `${rootPath}/:id`,
    {
      config: { ratelimit: { max: 1, timeWindow: 5 * 1000 } }, // Not used often, shouldn't be tried often
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
            $ref: "responses.notFound#",
          },
        },
      },
    },
    async (request, reply) => {
      // Can be disabled as these routes are under authentication, and therefore will have a user
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const requestUser = request.user!;
      const userId = request.params.id;
      if (userId === "@me") {
        throw new BadRequest("You can't edit your own user");
      }

      if (!requestUser.admin) {
        throw new Forbidden("You don't have permission to edit users");
      }

      try {
        await instance.prisma.user.update({
          data: { staff: request.body.staff },
          where: { id: BigInt(userId) },
        });
      } catch (e) {
        if (e instanceof PrismaClientKnownRequestError) {
          throw new NotFound("User not found");
        }
      }
      return reply.send(204);
    }
  );
  // Get a user's guilds
  instance.get<{
    Params: UserParamsType;
    Querystring: GetUserGuildsQuerystringType;
  }>(
    `${rootPath}/@me/guilds`,
    {
      config: { ratelimit: { max: 3, timeWindow: 5 * 1000 } }, // Called often(ish), but resource heavy, so limit to 3/5s
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
          ...errors401to404ResponseSchema,
        },
      },
    },
    async (request) => {
      // Can be disabled as these routes are under authentication, and therefore will have a user
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const user = request.user!;
      const guilds = await instance.discordOauthRequests.fetchUserGuilds(user);
      const filteredGuilds = [];
      for (const guild of guilds) {
        try {
          await (
            await instance.redisGuildManager.getGuild(guild.id)
          ).name; // Test if the guild is in cache, if it's not the getter will throw
          // TODO doesn't respect connected
          filteredGuilds.push({
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            permissions: guild.permissions,
            connected: true,
          });
        } catch (e) {
          if (
            (request.query.include_disconnected ?? false) &&
            ((BigInt(guild.permissions) & DiscordPermissions.MANAGE_GUILD) ===
              DiscordPermissions.MANAGE_GUILD ||
              (BigInt(guild.permissions) & DiscordPermissions.ADMINISTRATOR) ===
                DiscordPermissions.ADMINISTRATOR ||
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
