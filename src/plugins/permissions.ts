// Registering the permissions manager to the instance

import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

import PermissionManager from "../lib/permissions/manager";

declare module "fastify" {
  interface FastifyInstance {
    permissionManager: PermissionManager;
  }
}

const permissionPlugin = fp(
  // eslint-disable-next-line @typescript-eslint/require-await
  async (instance: FastifyInstance) => {
    instance.decorate("permissionManager", new PermissionManager(instance));
  }
);

export default permissionPlugin;
