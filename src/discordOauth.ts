/**
 * Custom client for making requests to Discord's OAuth2 API
 */

import axios, { AxiosError, AxiosResponse } from "axios";
import {
  RESTGetAPICurrentUserGuildsResult,
  RESTGetAPICurrentUserResult,
  RESTGetCurrentUserGuildMemberResult,
  RESTPostOAuth2AccessTokenResult,
  Snowflake,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import { URLSearchParams } from "url";

import { discordAPIBaseURL, requiredScopes } from "#root/constants";
import {
  ExpectedOauth2Failure,
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "#root/errors";
import { UserRequestData } from "#root/plugins/authentication";

// Two different responses to differentiate between a cache and uncached response
// This is because they need to be handled differently
interface CachedResponse {
  cached: true;
  data: unknown;
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

  // _makeRequest has two type overloads
  // This one is for when the response can from the cache (so could be either uncached or cached)
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
    body?: unknown;
    headers?: Record<string, string>;
    token?: string;
    cacheExpiry: number;
    userId: Snowflake;
  }): Promise<UncachedResponse | CachedResponse>;

  // This overload if for then the response cannot be from the cache (cacheExpiry is undefined)
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
    body?: unknown;
    headers?: Record<string, string>;
    token?: string;
    cacheExpiry?: undefined;
    userId?: undefined;
  }): Promise<UncachedResponse>;

  // Function to make all requests through - this is to allow for caching
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

    body?: unknown;
    headers?: Record<string, string>;
    token?: string;
    cacheExpiry?: number;
    userId?: Snowflake;
  }): Promise<UncachedResponse | CachedResponse> {
    // If the cacheExpiry is defined and the request if from user, then the response can be cached
    // Otherwise it cannot not
    if (cacheExpiry !== undefined && userId !== undefined) {
      const cachedResponse = (await this._instance.redisCache.getOauthCache(
        path,
        userId
      )) as string | null;

      if (cachedResponse !== null) {
        return { cached: true, data: cachedResponse };
      }
      const response = await this._makeRequest({
        path,
        method,
        body,
        headers,
        token,
      });
      await this._instance.redisCache.setOauthCache(
        path,
        userId,
        response.response.data
      );
      return response;
    }
    if (token !== undefined) {
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
    } catch (e: unknown) {
      throw this._handleError((e as AxiosError).response as AxiosResponse);
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
        InteractionOrRequestFinalStatus.OAUTH_TOKEN_EXPIRED,
        "Token expired, please re-authenticate"
      );
    } else {
      return new UnexpectedFailure(
        InteractionOrRequestFinalStatus.OAUTH_REQUEST_FAILED,
        `Oauth request to ${
          // TODO: Fix this type mess. Most likely by changing request libs
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,  @typescript-eslint/restrict-template-expressions, @typescript-eslint/strict-boolean-expressions
          response.request.path || "Unknown path"
        } failed with the status ${statusCode}`
      );
    }
  }

  async fetchUser(user: {
    userId?: Snowflake;
    token: string;
  }): Promise<RESTGetAPICurrentUserResult> {
    let cacheExpiry: number | undefined;
    let response;
    if (user.userId !== undefined) {
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
      return response.data as RESTGetAPICurrentUserResult;
    }
    const uncachedResponse = response.response;

    return uncachedResponse.data as RESTGetAPICurrentUserResult;
  }
  async exchangeToken(code: string): Promise<RESTPostOAuth2AccessTokenResult> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this._instance.envVars.DISCORD_CLIENT_ID,
      client_secret: this._instance.envVars.DISCORD_CLIENT_SECRET,
      code,
      redirect_uri: `${this._instance.envVars.SITE_URL}/auth/callback`,
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
      return response.data as RESTGetCurrentUserGuildMemberResult;
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
      return response.data as RESTGetAPICurrentUserGuildsResult;
    }
    const uncachedResponse = response.response;
    return uncachedResponse.data as RESTGetAPICurrentUserGuildsResult;
  }
  static verifyScopes(scopes: string): boolean {
    return requiredScopes.every((scope) => scopes.includes(scope));
  }
  generateAuthUrl(state: string): string {
    return `https://discord.com/api/oauth2/authorize?response_type=code&client_id=${
      this._instance.envVars.DISCORD_CLIENT_ID // This is checked on startup
    }&redirect_uri=${`${this._instance.envVars.SITE_URL}/auth/callback`}&scope=${requiredScopes.join(
      "%20"
    )}&state=${state}`;
  }
}

export default DiscordOauthRequests;
