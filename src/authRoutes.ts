// This route file is separate from the other routes since auth routes are not versioned
import { FastifyInstance } from "fastify";
import httpErrors from "http-errors";
const { Forbidden } = httpErrors;
import fastifyRateLimit from "@fastify/rate-limit";
import { Static, Type } from "@sinclair/typebox";
import crypto from "crypto";
import Redis from "ioredis";
import { v4 as uuidv4 } from "uuid";

import DiscordOauthRequests from "./discordOauth";

const CallbackQuerystring = Type.Object({
  code: Type.String(),
  state: Type.Optional(Type.String()),
});

type CallbackQuerystringType = Static<typeof CallbackQuerystring>;

const AuthorizeQuerystring = Type.Object({
  redirect_url: Type.Optional(Type.String()),
});

type AuthorizeQuerystringType = Static<typeof AuthorizeQuerystring>;

type StoredStateResponse = {
  redirectPath: string | null;
};

const rootPath = "/auth";

// Since this is a plugin
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
      const cachedState = await instance.redisCache.getState(state);
      if (!cachedState) {
        return new Forbidden("Cannot find state, please try again");
      }
      await instance.redisCache.deleteState(state);
      const tokenResponse = await instance.discordOauthRequests.exchangeToken(
        code
      );
      if (!DiscordOauthRequests.verifyScopes(tokenResponse.scope)) {
        return new Forbidden("Invalid scopes, please try again");
      }
      const user = await instance.discordOauthRequests.fetchUser({
        token: tokenResponse.access_token,
      });
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
