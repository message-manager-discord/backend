import axios, { AxiosResponse } from "axios";
import {
  RESTGetAPICurrentUserResult,
  RESTPostOAuth2AccessTokenResult,
  Snowflake,
  RESTGetAPICurrentUserGuildsResult,
  RESTGetCurrentUserGuildMemberResult,
} from "discord-api-types/v10";
import { FastifyInstance } from "fastify";
import { URLSearchParams } from "url";
import { discordAPIBaseURL, requiredScopes } from "./constants";
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
    return {
      cached: false,
      response: await axios.request({
        url: `${discordAPIBaseURL}${path}`,
        method,
        data: body,
        headers,
      }),
    };
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
    if (!(200 <= uncachedResponse.status && 300 > uncachedResponse.status)) {
      throw new Error(uncachedResponse.statusText);
    }

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
    if (!(200 <= response.status && 300 > response.status)) {
      throw new Error(response.statusText);
    }
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
    if (!(200 <= uncachedResponse.status && 300 > uncachedResponse.status)) {
      throw new Error(uncachedResponse.statusText);
    }
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
    if (!(200 <= uncachedResponse.status && 300 > uncachedResponse.status)) {
      throw new Error(uncachedResponse.statusText);
    }
    return uncachedResponse.data as RESTGetAPICurrentUserGuildsResult;
  }
  static verifyScopes(scopes: string): boolean {
    return requiredScopes.every((scope) => scopes.includes(scope));
  }
}

export default DiscordOauthRequests;
