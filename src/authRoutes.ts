// This route file is separate from the other routes since auth routes are not versioned
import { FastifyInstance } from "fastify";
import httpErrors from "http-errors";
const { Forbidden } = httpErrors;
import { Static, Type } from "@sinclair/typebox";
import { v5 as uuidv5 } from "uuid";
import crypto from "crypto";
import DiscordOauthRequests from "./discordOauth";

const CallbackQuerystring = Type.Object({
  code: Type.String(),
  state: Type.Optional(Type.String()),
});

type CallbackQuerystringType = Static<typeof CallbackQuerystring>;

const AuthorizeQuerystring = Type.Object({
  redirect_to: Type.Optional(Type.String()),
});

type AuthorizeQuerystringType = Static<typeof AuthorizeQuerystring>;

type StoredStateResponse = {
  redirectPath: string | null;
};

const rootPath = "/auth";
const sessionCookieKey = "mm-s-id";

const addPlugin = async (instance: FastifyInstance) => {
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
      const { redirect_to } = request.query as AuthorizeQuerystringType;

      const state = crypto.randomBytes(16).toString("hex");
      instance.redisCache.setState(state, redirect_to ? redirect_to : null);
      reply.redirect(307, DiscordOauthRequests.generateAuthUrl(state));
    }
  );
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
      const { code, state } = request.query as CallbackQuerystringType;
      if (!state) {
        return new Forbidden("Missing state");
      }
      const cachedState = await instance.redisCache.getState(state);
      if (!cachedState) {
        return new Forbidden("Cannot find state, please try again");
      }
      instance.redisCache.deleteState(state);
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

      const session = uuidv5(user.id, process.env.UUID_NAMESPACE as string);
      await instance.redisCache.setSession(session, user.id);
      const date = new Date();
      date.setDate(date.getDate() + 7);
      reply.setCookie("_HOST-session", session, {
        secure: true,
        sameSite: "none",
        httpOnly: true,
        path: "/",
        expires: date,
        signed: true,
      });
      const redirectPath = cachedState.redirectPath || "/";
      reply.redirect(307, redirectPath); // TODO redirect to redirect url
    }
  );
};

export default addPlugin;

export { StoredStateResponse };
