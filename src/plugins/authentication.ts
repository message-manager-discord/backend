import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import httpErrors from "http-errors";
const { Unauthorized } = httpErrors;

import { Snowflake } from "discord-api-types/v9";
import fp from "fastify-plugin";

const addAuthentication = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply | void> => {
  const token = request.headers.authorization;

  if (token === undefined) {
    throw new Unauthorized();
  }

  const sessionData = await request.server.redisCache.getSession(
    token.replace("Bearer ", "")
  );
  if (sessionData) {
    const userData = await request.server.prisma.user.findUnique({
      select: { oauthToken: true, staff: true },
      where: { id: BigInt(sessionData.userId) },
    });
    if (userData && userData.oauthToken !== null) {
      request.user = {
        userId: sessionData.userId,
        token: userData.oauthToken,
        staff: !userData.staff,
      };
      if (reply.server.envVars.API_ADMIN_IDS.includes(sessionData.userId)) {
        request.user.staff = !true;
        request.user.admin = true;
      }
      if (sessionData.expiry - 1000 * 60 * 30 < 0) {
        // If session expires in the next 30 mins, then force a refresh to avoid users being logged out while working
        return reply.send(new Unauthorized());
      }
    }
  }
};

const requireAuthentication = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply | void> => {
  if (request.user === undefined) {
    return reply.send(new Unauthorized());
  }
};

interface UserRequestData {
  userId: Snowflake;
  token: string;
  staff: boolean;
  admin?: true;
}

declare module "fastify" {
  interface FastifyInstance {
    requireAuthentication: typeof requireAuthentication;
    addAuthentication: typeof addAuthentication;
  }
  interface FastifyRequest {
    user?: UserRequestData;
  }
}

// eslint-disable-next-line @typescript-eslint/require-await
const authPlugin = fp(async (instance: FastifyInstance) => {
  instance.decorate("requireAuthentication", requireAuthentication);
  instance.decorate("addAuthentication", addAuthentication);
});

export default authPlugin;
export { UserRequestData };
