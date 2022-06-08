import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

import SessionManager from "../lib/session";

declare module "fastify" {
  interface FastifyInstance {
    sessionManager: SessionManager;
  }
}

const sessionPlugin = fp(
  // eslint-disable-next-line @typescript-eslint/require-await
  async (instance: FastifyInstance) => {
    instance.decorate(
      "sessionManager",
      new SessionManager({
        instance,
      })
    );
  }
);

export default sessionPlugin;
