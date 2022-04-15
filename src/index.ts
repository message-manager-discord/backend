import fastify, { FastifyInstance } from "fastify";

import envPlugin from "./plugins/envCheck";
import versionOnePlugin from "./v1";
import fastifyAuth from "fastify-auth";
import authPlugin from "./plugins/authentication";
import fastifyCors from "fastify-cors";
import prismaPlugin from "./plugins/prisma";
import discordRestPlugin from "./plugins/discord-rest";
import redisRestPlugin from "./plugins/redis";
import discordRedisCachePlugin from "./plugins/discordRedis";
import metricsPlugin from "./plugins/metrics";
import webhookAndLoggingPlugin from "./plugins/logging";
import fastifyCookie, { FastifyCookieOptions } from "fastify-cookie";
import interactionsPlugin from "./interactions/index";
import Sentry from "@sentry/node";

import authRoutePlugin from "./authRoutes";
const instance: FastifyInstance = fastify({
  logger: true,
});

await instance.register(envPlugin); // Load env variables

// Sentry is registered before all other plugins incase they throw errors
// Sentry is not a plugin so all errors are captured

Sentry.init({
  dsn: instance.envVars.SENTRY_DSN,
});

instance.setErrorHandler(async (error, request, reply) => {
  Sentry.captureException(error);
  instance.log.error(error);
  return reply.status(500).send({
    statusCode: 500,
    error: "Internal Server Error",
    message: error.message,
  });
});
// These are plugins that are separate from versioning
await instance.register(prismaPlugin);
await instance.register(discordRestPlugin, {
  detritus: { token: instance.envVars.DISCORD_TOKEN },
});
await instance.register(redisRestPlugin, {
  redis: {
    host: instance.envVars.BACKEND_REDIS_HOST,
    port: instance.envVars.BACKEND_REDIS_PORT,
  },
});
await instance.register(discordRedisCachePlugin, {
  redis: {
    host: instance.envVars.DISCORD_CACHE_REDIS_HOST,
    port: instance.envVars.DISCORD_CACHE_REDIS_PORT,
  },
});

await instance.register(fastifyCookie, {
  secret: instance.envVars.COOKIE_SECRET, // for cookies signature
  parseOptions: {}, // options for parsing cookies
} as FastifyCookieOptions);
await instance.register(fastifyCors, {
  origin: true,
  methods: ["GET", "PUT", "POST", "DELETE", "PATCH"],
  credentials: true,
});

await instance.register(authPlugin);
await instance.register(fastifyAuth);

await instance.register(metricsPlugin);

await instance.register(webhookAndLoggingPlugin);

await instance.register(interactionsPlugin);

await instance.register(authRoutePlugin);

await instance.register(versionOnePlugin, { prefix: "/v1" });

instance.listen(
  instance.envVars.PORT,
  instance.envVars.HOST,
  function (err, address) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    instance.log.info(`Server is now listening on ${address}`);
  }
);
