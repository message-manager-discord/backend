// Registering the webhook manager to the instance
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

import LoggingManager from "../lib/logging/manager.js";
import WebhookManager from "../lib/webhook/manager.js";

declare module "fastify" {
  interface FastifyInstance {
    webhookManager: WebhookManager;
    loggingManager: LoggingManager;
  }
}

const webhookAndLoggingPlugin = fp(
  // eslint-disable-next-line @typescript-eslint/require-await
  async (instance: FastifyInstance) => {
    instance.decorate("webhookManager", new WebhookManager(instance));
    instance.decorate(
      "loggingManager",
      new LoggingManager(instance.webhookManager, instance),
    );
  },
);

export default webhookAndLoggingPlugin;
