/**
 * This contains a function that adds a user object to the request
 * It sends an Unauthorized error if not authenticated
 * The function must be added in a pre-handler hook to run - this is so only routes that need authentication will require it
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import httpErrors from "http-errors";
const { Unauthorized } = httpErrors;

import { Snowflake } from "discord-api-types/v9";
import fp from "fastify-plugin";

const requireAuthentication = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply | void> => {
  const sessionSigned = request.cookies["_HOST-session"];
  let session: string | null;
  try {
    session = request.unsignCookie(sessionSigned)["value"];
  } catch {
    // Unsigning the cookie will throw if it is invalid. This likely means either it is empty, or it's been changed by an attacker
    throw new Unauthorized();
  }

  if (session === null) {
    // Not logged in
    throw new Unauthorized();
  }

  // Check if the session is valid and not expired
  const sessionData = await request.server.redisCache.getSession(session);
  if (!sessionData) {
    // Clear cookie so cache doesn't get hit again on next request
    return reply.clearCookie("_HOST-session").send(new Unauthorized());
  } else {
    // Then get the user's data from the database - it is separate as sessions should expire but the user's data should not
    const userData = await request.server.prisma.user.findUnique({
      select: { oauthToken: true, staff: true },
      where: { id: BigInt(sessionData.userId) },
    });
    // We also need the oauthToken - if it's not there not signed in (to get another one)
    if (!userData || userData.oauthToken === null) {
      return reply.send(new Unauthorized());
    }
    request.user = {
      userId: sessionData.userId,
      token: userData.oauthToken,
      staff: userData.staff,
    };
    if (sessionData.expiry - 1000 * 60 * 30 < 0) {
      // If session expires in the next 30 mins, then force a refresh to avoid users being logged out while working
      return reply.clearCookie("_HOST-session").send(new Unauthorized());
    }
  }
};

interface UserRequestData {
  userId: Snowflake;
  token: string;
  staff: boolean;
}

declare module "fastify" {
  interface FastifyInstance {
    requireAuthentication: typeof requireAuthentication;
  }
  interface FastifyRequest {
    user?: UserRequestData;
  }
}

// eslint-disable-next-line @typescript-eslint/require-await
const authPlugin = fp(async (instance: FastifyInstance) => {
  instance.decorate("requireAuthentication", requireAuthentication);
});

export default authPlugin;
export { UserRequestData };
