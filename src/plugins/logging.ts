// Registering the webhook manager to the instance
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

import LoggingManager from "../lib/logging/manager";
import WebhookManager from "../lib/webhook/manager";

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
      new LoggingManager(instance.webhookManager, instance)
    );
  }
);

export default webhookAndLoggingPlugin;
