import { Snowflake } from "discord-api-types/globals";
import { RESTGetAPIUserResult, Routes } from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import {
  ExpectedOauth2Failure,
  InteractionOrRequestFinalStatus,
} from "../errors";

const getUserData = async (
  userId: Snowflake,
  instance: FastifyInstance
): Promise<{
  avatar: string | null;
  username: string;
  discriminator: string;
}> => {
  // First try the cache
  const cachedData = await instance.redisCache.getUserData(userId);
  if (cachedData !== null) {
    return cachedData;
  }
  // First if the user has an oauthToken set - use that to id user - to avoid ratelimit issues
  const token = await instance.prisma.user.findUnique({
    where: { id: BigInt(userId) },
    select: { oauthToken: true },
  });
  let user: RESTGetAPIUserResult | undefined = undefined;
  if (token?.oauthToken !== undefined && token.oauthToken !== null) {
    try {
      user = await instance.discordOauthRequests.fetchUser({
        token: token.oauthToken,
        userId: userId,
      });
    } catch (error) {
      if (
        !(
          error instanceof ExpectedOauth2Failure &&
          error.status === InteractionOrRequestFinalStatus.OAUTH_TOKEN_EXPIRED
        )
      ) {
        throw error;
      }
    }
  }
  // if that didn't work, try the bot token
  if (user === undefined) {
    // Fetch user from discord API
    user = (await instance.restClient.get(
      Routes.user(userId)
    )) as RESTGetAPIUserResult;
  }
  // Store hash in cache
  await instance.redisCache.setUserData(user.id, {
    avatar:
      user.avatar !== null
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : null,
    username: user.username,
    discriminator: user.discriminator,
  });
  return {
    avatar:
      user.avatar !== null
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : null,
    username: user.username,
    discriminator: user.discriminator,
  };
};

export { getUserData };
