/**
 * This route file is separate from the other routes since auth routes are not versioned
 * As they are only used by the website - which is always up to date
 * They are routes to run the OAuth2 flow with discord
 */
import { FastifyInstance } from "fastify";
import httpErrors from "http-errors";
const { Forbidden } = httpErrors;
import { Static, Type } from "@sinclair/typebox";
import crypto from "crypto";
import { v5 as uuidv5 } from "uuid";

import DiscordOauthRequests from "./discordOauth";

// Callback after authorized with discord
const CallbackQuerystring = Type.Object({
  code: Type.String(),
  state: Type.Optional(Type.String()),
});

type CallbackQuerystringType = Static<typeof CallbackQuerystring>;

// Route before authorized with discord - navigated too to get redirected to discord
const AuthorizeQuerystring = Type.Object({
  redirect_to: Type.Optional(Type.String()),
});

type AuthorizeQuerystringType = Static<typeof AuthorizeQuerystring>;

type StoredStateResponse = {
  redirectPath: string | null;
};

const rootPath = "/auth";

// Since this is a plugin async should be used
// eslint-disable-next-line @typescript-eslint/require-await
const addPlugin = async (instance: FastifyInstance) => {
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
          307: {},
        },
      },
    },
    async (request, reply) => {
      const { redirect_to } = request.query;

      const state = crypto.randomBytes(16).toString("hex");
      await instance.redisCache.setState(state, redirect_to ?? null);

      return reply.redirect(
        307,
        instance.discordOauthRequests.generateAuthUrl(state)
      );
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
          307: {},
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
      const session = uuidv5(user.id, instance.envVars.UUID_NAMESPACE);
      await instance.redisCache.setSession(session, user.id);
      const date = new Date();
      date.setDate(date.getDate() + 7);

      const redirectPath = cachedState.redirectPath ?? "/";
      // This cookie will be used to authenticate the client to the api
      return reply
        .setCookie("_HOST-session", session, {
          secure: true,
          sameSite: "none",
          httpOnly: true,
          path: "/",
          expires: date,
          signed: true,
        })
        .redirect(307, redirectPath);
    }
  );
};

export default addPlugin;

export { StoredStateResponse };
