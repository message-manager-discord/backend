import axios, { AxiosResponse } from "axios";
import {
  RESTGetAPICurrentUserResult,
  RESTPostOAuth2AccessTokenResult,
  Snowflake,
  RESTGetAPICurrentUserGuildsResult,
  RESTGetCurrentUserGuildMemberResult,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import { URLSearchParams } from "url";
import { discordAPIBaseURL, requiredScopes } from "./constants";
import {
  ExpectedOauth2Failure,
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "./errors";
import { UserRequestData } from "./plugins/authentication";

interface CachedResponse {
  cached: true;
  data: any;
}
interface UncachedResponse {
  cached: false;
  response: AxiosResponse;
}
class DiscordOauthRequests {
  private _instance: FastifyInstance;
  constructor(instance: FastifyInstance) {
    this._instance = instance;
  }
  private async _makeRequest({
    path,
    method,
    body,
    headers,
    token,
    cacheExpiry,
    userId,
  }: {
    path: string;
    method: "GET" | "POST" | "PUT" | "DELETE";
    body?: any;
    headers?: Record<string, string>;
    token?: string;
    cacheExpiry: number;
    userId: Snowflake;
  }): Promise<UncachedResponse | CachedResponse>;

  private async _makeRequest({
    path,
    method,
    body,
    headers,
    token,
    cacheExpiry,
    userId,
  }: {
    path: string;
    method: "GET" | "POST" | "PUT" | "DELETE";
    body?: any;
    headers?: Record<string, string>;
    token?: string;
    cacheExpiry?: undefined;
    userId?: undefined;
  }): Promise<UncachedResponse>;

  private async _makeRequest({
    path,
    method,
    body,
    headers,
    token,
    cacheExpiry,
    userId,
  }: {
    path: string;
    method: "GET" | "POST" | "PUT" | "DELETE";
    body?: any;
    headers?: Record<string, string>;
    token?: string;
    cacheExpiry?: number;
    userId?: Snowflake;
  }): Promise<UncachedResponse | CachedResponse> {
    if (cacheExpiry && userId) {
      // TODO: Should cacheExpiry be checked / used
      // Requests without a token are not cached
      const cachedResponse = await this._instance.redisCache.getOauthCache(
        path,
        userId
      );

      if (cachedResponse) {
        return { cached: true, data: cachedResponse };
      }
      const response = await this._makeRequest({
        path,
        method,
        body,
        headers,
        token,
      });
      this._instance.redisCache.setOauthCache(
        path,
        userId,
        response.response.data
      );
      return response;
    }
    if (token) {
      headers = { ...headers, Authorization: `Bearer ${token}` };
    }
    let response: AxiosResponse;
    try {
      response = await axios.request({
        url: `${discordAPIBaseURL}${path}`,
        method,
        data: body,
        headers,
      });
    } catch (e: any) {
      throw this._handleError(e.response as AxiosResponse);
    }
    return {
      cached: false,
      response,
    };
  }

  private _handleError(response: AxiosResponse): Error {
    const statusCode = response.status;
    if (statusCode === 401) {
      return new ExpectedOauth2Failure(
        InteractionOrRequestFinalStatus.OATUH_TOKEN_EXPIRED,
        "Token expired, please re-authenticate"
      );
    } else {
      return new UnexpectedFailure(
        InteractionOrRequestFinalStatus.OAUTH_REQUEST_FAILED,
        `Oauth request to ${response.request.path} failed with the status ${statusCode}`
      );
    }
  }

  async fetchUser(user: {
    userId?: Snowflake;
    token: string;
  }): Promise<RESTGetAPICurrentUserResult> {
    let cacheExpiry: number | undefined;
    let response;
    if (user.userId) {
      cacheExpiry = 1000 * 60 * 5; // 5 minutes
      response = await this._makeRequest({
        path: "/users/@me",
        method: "GET",

        cacheExpiry,
        userId: user.userId,
        token: user.token,
      });
    } else {
      response = await this._makeRequest({
        path: "/users/@me",
        method: "GET",

        token: user.token,
      });
    }
    if (response.cached) {
      return response.data;
    }
    const uncachedResponse = response.response;

    return uncachedResponse.data as RESTGetAPICurrentUserResult;
  }
  async exchangeToken(code: string): Promise<RESTPostOAuth2AccessTokenResult> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      code,
      redirect_uri: `${process.env.BASE_API_URL}/auth/callback`,
    });
    const response = (
      await this._makeRequest({
        path: "/oauth2/token",
        method: "POST",
        body,
      })
    ).response;
    return response.data as RESTPostOAuth2AccessTokenResult;
  }
  async fetchGuildMember(
    guildId: Snowflake,
    user: UserRequestData
  ): Promise<RESTGetCurrentUserGuildMemberResult> {
    const response = await this._makeRequest({
      path: `/users/@me/guilds/${guildId}/member`,
      method: "GET",

      cacheExpiry: 1000 * 60 * 1.5, // 1.5 minutes to allow for relativity up to date data within the 5 / 3 minute ratelimit
      ...user,
    });
    if (response.cached) {
      return response.data;
    }
    const uncachedResponse = response.response;

    return uncachedResponse.data as RESTGetCurrentUserGuildMemberResult;
  }
  async fetchUserGuilds(
    user: UserRequestData
  ): Promise<RESTGetAPICurrentUserGuildsResult> {
    const response = await this._makeRequest({
      path: "/users/@me/guilds",
      method: "GET",
      cacheExpiry: 1000 * 60 * 2.5, // 2.5 minutes
      ...user,
    });
    if (response.cached) {
      return response.data;
    }
    const uncachedResponse = response.response;
    return uncachedResponse.data as RESTGetAPICurrentUserGuildsResult;
  }
  static verifyScopes(scopes: string): boolean {
    return requiredScopes.every((scope) => scopes.includes(scope));
  }
  static generateAuthUrl(state: string): string {
    return `https://discord.com/api/oauth2/authorize?response_type=code&client_id=${
      process.env.DISCORD_CLIENT_ID // This is checked on startup
    }&redirect_uri=${`${process.env.BASE_API_URL}/auth/callback`}&scope=${requiredScopes.join(
      "%20"
    )}&state=${state}`;
  }
}

export default DiscordOauthRequests;
