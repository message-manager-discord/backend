/**
 * Metric logging logic - accessed through prometheus
 */

import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import httpErrors from "http-errors";
import { Counter, register, Summary } from "prom-client";
const { Unauthorized } = httpErrors;

// To differenate between the types of metrics - as metrics are accumulated from the different services
const metricsPrefix = "api_";

// Schema for metrics
class Metrics {
  // This is a counter for interaction commands
  readonly commandsUsed = new Counter({
    name: `${metricsPrefix}commands_used`,
    help: "Number of commands used",
    labelNames: ["command"],
  });
  // And a counter for all interactions
  readonly interactionsReceived = new Counter({
    name: `${metricsPrefix}interactions_received`,
    help: "Number of interactions received",
    labelNames: ["type", "status", "deferred"],
  });
  // And a summary which provides both count and duration information for requests
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

  // route for prometheus to scrape
  instance.get("/metrics", async (request, reply) => {
    if (
      request.headers.authorization?.replace(/BEARER\s*/i, "") !==
      instance.envVars.METRICS_AUTH_TOKEN
    ) {
      throw new Unauthorized("Unauthorized");
    }
    return reply.type("text/plain").send(await register.metrics());
  });
  // Collecting the request duration metric for all requests
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
