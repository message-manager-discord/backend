import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import httpErrors from "http-errors";
const { Unauthorized } = httpErrors;

import { Snowflake } from "discord-api-types/v9";
import fp from "fastify-plugin";

const requireAuthentication = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply | void> => {
  const token = request.headers.authorization;
  console.log(token);

  if (token === undefined) {
    throw new Unauthorized();
  }

  const sessionData = await request.server.redisCache.getSession(
    token.replace("Bearer ", "")
  );
  if (!sessionData) {
    return reply.send(new Unauthorized());
  } else {
    const userData = await request.server.prisma.user.findUnique({
      select: { oauthToken: true, staff: true },
      where: { id: BigInt(sessionData.userId) },
    });
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
      return reply.send(new Unauthorized());
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
