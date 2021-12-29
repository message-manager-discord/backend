import {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifyPluginOptions,
} from "fastify";
import { Unauthorized } from "http-errors";

import fp from "fastify-plugin";

const requireAuthentication = async (request: FastifyRequest): Promise<any> => {
  const sessionSigned = request.cookies["_HOST-session"];
  const { value: session } = request.unsignCookie(sessionSigned);

  console.log(`Session: ${session}`);
  if (!session) {
    throw new Unauthorized();
  }

  const userId = await request.server.redisCache.getSession(session);
  console.log(`UserId: ${userId}`);
  if (!userId) {
    throw new Unauthorized();
  }
  request.userId = userId;
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
