import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

import PermissionManager from "../lib/permissions/manager";
import SessionManager from "../lib/session";

declare module "fastify" {
  interface FastifyInstance {
    sessionManager: SessionManager;
    permissionManager: PermissionManager;
  }
}

const sessionPlugin = fp(
  // eslint-disable-next-line @typescript-eslint/require-await
  async (instance: FastifyInstance) => {
    instance.decorate("permissionManager", new PermissionManager(instance));
    instance.decorate(
      "sessionManager",
      new SessionManager({
        permissionsManager: instance.permissionManager,
        guildManager: instance.redisGuildManager,
      })
    );
  }
);

export default sessionPlugin;
