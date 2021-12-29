import axios from "axios";
import {
  RESTGetAPICurrentUserResult,
  RESTPostOAuth2AccessTokenResult,
  Snowflake,
  APIGuildMember,
  RESTGetAPICurrentUserGuildsResult,
  APIGuild,
} from "discord-api-types/v9";
import { URLSearchParams } from "url";
import { discordAPIBaseURL, requiredScopes } from "./constants";

const exchangeToken = async (
  code: string
): Promise<RESTPostOAuth2AccessTokenResult> => {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.DISCORD_CLIENT_ID!,
    client_secret: process.env.DISCORD_CLIENT_SECRET!,
    code,
    redirect_uri: `${process.env.BASE_API_URL}/auth/callback`,
  });
  const response = await axios.post(`${discordAPIBaseURL}/oauth2/token`, body);
  if (!(200 <= response.status && 300 > response.status)) {
    throw new Error(response.statusText);
  }
  return response.data as RESTPostOAuth2AccessTokenResult;
};

const verifyScopes = (scopes: string): boolean => {
  return requiredScopes.every((scope) => scopes.includes(scope));
};

const fetchUser = async (
  token: string
): Promise<RESTGetAPICurrentUserResult> => {
  const response = await axios.get(`${discordAPIBaseURL}/users/@me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!(200 <= response.status && 300 > response.status)) {
    throw new Error(response.statusText);
  }
  console.log("fetchUser", response.headers);
  return response.data as RESTGetAPICurrentUserResult;
};
const fetchGuildMember = async (
  guildId: Snowflake,
  token: string
): Promise<APIGuildMember> => {
  // TODO: Update this with the correct type when discord-api-types is updated
  const response = await axios.get(
    `${discordAPIBaseURL}/users/@me/guilds/${guildId}/member`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!(200 <= response.status && 300 > response.status)) {
    throw new Error(response.statusText);
  }
  console.log("fetchGuildMember", response.headers);
  return response.data as APIGuildMember;
};
const fetchUserGuilds = async (
  token: string
): Promise<RESTGetAPICurrentUserGuildsResult[]> => {
  const response = await axios.get(`${discordAPIBaseURL}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!(200 <= response.status && 300 > response.status)) {
    throw new Error(response.statusText);
  }
  console.log("fetchUserGuilds", response.headers);
  return response.data as RESTGetAPICurrentUserGuildsResult[];
};
export default {
  exchangeToken,
  verifyScopes,
  fetchUser,
  fetchGuildMember,
  fetchUserGuilds,
};
