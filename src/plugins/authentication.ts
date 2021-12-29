import {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifyPluginOptions,
} from "fastify";
import { Unauthorized } from "http-errors";

import fp from "fastify-plugin";

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

  console.log(`Session: ${session}`);
  if (!session) {
    throw new Unauthorized();
  }

  const sessionData = await request.server.redisCache.getSession(session);
  console.log(`UserId: ${sessionData?.userId}`);
  if (!sessionData) {
    reply.clearCookie("_HOST-session");
    reply.send(new Unauthorized());
  } else {
    request.userId = sessionData.userId;
    console.log(sessionData.expiry - 1000 * 60 * 30);
    if (sessionData.expiry - 1000 * 60 * 30 < 0) {
      // If session expires in the next 30 mins, then force a refresh to avoid users being logged out while working
      reply.clearCookie("_HOST-session");
      reply.send(new Unauthorized());
    }
  }
};

declare module "fastify" {
  interface FastifyInstance {
    requireAuthentication: typeof requireAuthentication;
  }
  interface FastifyRequest {
    userId?: string;
  }
}

const authPlugin = fp(
  async (instance: FastifyInstance, options?: FastifyPluginOptions) => {
    instance.decorate("requireAuthentication", requireAuthentication);
  }
);

export default authPlugin;
