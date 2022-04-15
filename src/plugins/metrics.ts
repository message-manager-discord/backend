import fp from "fastify-plugin";

import { FastifyInstance } from "fastify";

import { register, Counter, Summary } from "prom-client";

import httpErrors from "http-errors";
const { Unauthorized } = httpErrors;

const metricsPrefix = "api_";

class Metrics {
  readonly commandsUsed = new Counter({
    name: `${metricsPrefix}commands_used`,
    help: "Number of commands used",
    labelNames: ["command"],
  });
  readonly interactionsReceived = new Counter({
    name: `${metricsPrefix}interactions_received`,
    help: "Number of interactions received",
    labelNames: ["type", "status", "deferred"],
  });
  readonly requestDuration = new Summary({
    name: `${metricsPrefix}request_duration`,
    help: "Request duration in milliseconds",
    labelNames: ["method", "route", "status_code"],
    percentiles: [0.5, 0.9, 0.95, 0.99],
  });
}

declare module "fastify" {
  interface FastifyInstance {
    metrics: Metrics;
  }
}
// eslint-disable-next-line @typescript-eslint/require-await
const discordRestPlugin = fp(async (instance: FastifyInstance) => {
  const metricClient = new Metrics();

  instance.decorate("metrics", metricClient);

  instance.get("/metrics", async (request, reply) => {
    if (
      request.headers.authorization?.replace(/BEARER\s*/i, "") !==
      instance.envVars.METRICS_AUTH_TOKEN
    ) {
      throw new Unauthorized("Unauthorized");
    }
    return reply.type("text/plain").send(await register.metrics());
  });
  instance.addHook("onResponse", async (request, reply) => {
    metricClient.requestDuration.observe(
      {
        method: request.method,
        route: request.url,
        status_code: reply.statusCode,
      },
      reply.getResponseTime()
    );
  });
});

export default discordRestPlugin;
