import {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifyPluginOptions,
} from "fastify";
import httpErrors from "http-errors";
const { Unauthorized } = httpErrors;

import fp from "fastify-plugin";
import { Snowflake } from "discord-api-types/v9";

const requireAuthentication = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<any> => {
  const sessionSigned = request.cookies["_HOST-session"];
  let session: string | null;
  try {
    session = request.unsignCookie(sessionSigned)["value"];
  } catch {
    throw new Unauthorized();
  }

  if (!session) {
    throw new Unauthorized();
  }

  const sessionData = await request.server.redisCache.getSession(session);
  if (!sessionData) {
    reply.clearCookie("_HOST-session");
    reply.send(new Unauthorized());
  } else {
    const userData = await request.server.prisma.user.findUnique({
      select: { oauthToken: true, staff: true },
      where: { id: BigInt(sessionData.userId) },
    });
    if (!userData || !userData.oauthToken) {
      reply.send(new Unauthorized());
      return;
    }
    request.user = {
      userId: sessionData.userId,
      token: userData.oauthToken,
      staff: userData.staff,
    };
    if (sessionData.expiry - 1000 * 60 * 30 < 0) {
      // If session expires in the next 30 mins, then force a refresh to avoid users being logged out while working
      reply.clearCookie("_HOST-session");
      reply.send(new Unauthorized());
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

const authPlugin = fp(
  async (instance: FastifyInstance, options?: FastifyPluginOptions) => {
    instance.decorate("requireAuthentication", requireAuthentication);
  }
);

export default authPlugin;
export { UserRequestData };
