/**
 * This route file is separate from the other routes since auth routes are not versioned
 * As they are only used by the website - which is always up to date
 * They are routes to run the OAuth2 flow with discord
 */
import { FastifyInstance } from "fastify";
import httpErrors from "http-errors";
const { Forbidden } = httpErrors;
import fastifyRateLimit from "@fastify/rate-limit";
import { Static, Type } from "@sinclair/typebox";
import crypto from "crypto";
import Redis from "ioredis";
import { v4 as uuidv4 } from "uuid";

import DiscordOauthRequests from "#root/discordOauth";

// Callback after authorized with discord
const CallbackQuerystring = Type.Object({
  code: Type.String(),
  state: Type.Optional(Type.String()),
});

type CallbackQuerystringType = Static<typeof CallbackQuerystring>;

// Route before authorized with discord - navigated too to get redirected to discord
const AuthorizeQuerystring = Type.Object({
  redirect_url: Type.Optional(Type.String()),
});

type AuthorizeQuerystringType = Static<typeof AuthorizeQuerystring>;

type StoredStateResponse = {
  redirectPath: string | null;
};

const rootPath = "/auth";

// Since this is a plugin async should be used
// eslint-disable-next-line @typescript-eslint/require-await
const addPlugin = async (instance: FastifyInstance) => {
  await instance.register(fastifyRateLimit, {
    global: true,
    max: 20, // 20 requests per minute, shouldn't be hit by a user
    timeWindow: 60 * 1000, // 1 minute
    cache: 10000,
    redis: new Redis({
      connectionName: "my-connection-name",
      host: instance.envVars.BACKEND_REDIS_HOST,
      port: instance.envVars.BACKEND_REDIS_PORT,
      connectTimeout: 500,
      maxRetriesPerRequest: 1,
    }),
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    keyGenerator: (request) => {
      console.log(request.ip);
      console.log(request.user);
      console.log(request.user?.userId);

      return request.user?.userId !== undefined
        ? request.user.userId
        : request.ip;
    },
    enableDraftSpec: true,
  });
  // Must be registered a second time as v1 and auth routes are separate

  /**
   * Authorize route, navigated too to get redirected to discord
   * If redirect_to is set the user will be redirected to that after navigating to /callback
   * This route also generates a state to be used in the oauth flow - which is used for security
   */
  instance.get<{ Querystring: AuthorizeQuerystringType }>(
    `${rootPath}/authorize`,
    {
      schema: {
        querystring: AuthorizeQuerystring,
        response: {
          200: {
            type: "object",
            properties: {
              redirectUrl: { type: "string" },
            },
          },
        },
      },
      config: {
        ratelimit: {
          max: 2,
          timeWindow: 5 * 1000,
          // 2 per 5 seconds
        },
      },
    },
    async (request, reply) => {
      const { redirect_url } = request.query;

      const state = crypto.randomBytes(16).toString("hex");
      await instance.redisCache.setState(state, redirect_url ?? null);
      const redirectUrl = instance.discordOauthRequests.generateAuthUrl(state);

      return reply.send({ redirectUrl });
    }
  );
  /**
   * Callback route, navigated too after authorized with discord
   * This route will get the user's access token and refresh token from discord
   * Then it will get the user's data - and store that
   * Then generate a token - a way of authentication between the user and the api
   * Then redirect the user to the redirect_to path - if it was set
   */
  instance.get<{ Querystring: CallbackQuerystringType }>(
    `${rootPath}/callback`,
    {
      schema: {
        querystring: CallbackQuerystring,
        response: {
          200: {
            type: "object",
            properties: {
              redirectUrl: {
                type: "string",
              },
              token: {
                type: "string",
              },
            },
          },
        },
      },
      config: {
        ratelimit: {
          max: 2,
          timeWindow: 5 * 1000,
          // 2 per 5 seconds
          // To prevent brute force attacks
        },
      },
    },
    async (request, reply) => {
      const { code, state } = request.query;
      if (state === undefined) {
        return new Forbidden("Missing state");
      }
      // State must be valid, present and the same - for security
      const cachedState = await instance.redisCache.getState(state);
      if (!cachedState) {
        return new Forbidden("Cannot find state, please try again");
      }
      // Delete state so it cannot be used again - again for security
      await instance.redisCache.deleteState(state);

      const tokenResponse = await instance.discordOauthRequests.exchangeToken(
        code
      );
      // If the required scopes are not set then the data required might not be accessible
      if (!DiscordOauthRequests.verifyScopes(tokenResponse.scope)) {
        return new Forbidden("Invalid scopes, please try again");
      }
      const user = await instance.discordOauthRequests.fetchUser({
        token: tokenResponse.access_token,
      });

      await instance.redisCache.setUserData(user.id, {
        avatar:
          user.avatar !== null
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
            : null,
        discriminator: user.discriminator,
        username: user.username,
      });

      // Create user in database - the token is stored here and not on the browser
      // so the token does not get stolen, which could lead to actions under the bot's id being taken on
      // behalf of the user that we do not want to happen

      await instance.prisma.user.upsert({
        where: { id: BigInt(user.id) },
        create: {
          id: BigInt(user.id),
          oauthToken: tokenResponse.access_token,
          oauthTokenExpiration: new Date(Date.now() + tokenResponse.expires_in),
          refreshToken: tokenResponse.refresh_token,
        },
        update: {
          oauthToken: tokenResponse.access_token,
          oauthTokenExpiration: new Date(Date.now() + tokenResponse.expires_in),
          refreshToken: tokenResponse.refresh_token,
        },
      });

      // Session is to authenticate the client to the api
      const sessionToken = `browser.${uuidv4()}.${user.id}.${Date.now()}`;
      await instance.redisCache.setSession(sessionToken, user.id);
      const date = new Date();
      date.setDate(date.getDate() + 7);
      const redirectPath = cachedState.redirectPath ?? "/";
      return reply.send({ redirectUrl: redirectPath, token: sessionToken });
    }
  );
};

export default addPlugin;

export { StoredStateResponse };
