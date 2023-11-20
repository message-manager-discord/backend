/**
 * Entry point file
 * Includes setup of core plugins for the HTTP server
 */

import fastifyAuth from "@fastify/auth";
import fastifyCookie, { FastifyCookieOptions } from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { RewriteFrames } from "@sentry/integrations";
import Sentry from "@sentry/node";
import childProcess from "child_process";
import fastify, { FastifyInstance } from "fastify";
import * as url from "url";

import authRoutePlugin from "./authRoutes";
import interactionsPlugin from "./interactions/index";
import authPlugin from "./plugins/authentication";
import discordRestPlugin from "./plugins/discord-rest";
import discordRedisCachePlugin from "./plugins/discordRedis";
import envPlugin from "./plugins/envCheck";
import webhookAndLoggingPlugin from "./plugins/logging";
import metricsPlugin from "./plugins/metrics";
import permissionPlugin from "./plugins/permissions";
import prismaPlugin from "./plugins/prisma";
import redisRestPlugin from "./plugins/redis";
import sessionPlugin from "./plugins/session";
import stripePlugin from "./plugins/stripe";
import versionOnePlugin from "./v1";

const productionEnv = process.env.PRODUCTION === "true";

const instance: FastifyInstance = fastify({
  logger: {
    level: productionEnv ? "warn" : "info",
  },
}).withTypeProvider<TypeBoxTypeProvider>();

// This plugin loads environmental variables from .env, and registers a .envVars object to the fastify instance
await instance.register(envPlugin);

/**
 * Sentry is used to capture errors in production (https://sentry.io)
 * Here it is initiated before most other plugins so it can catch those errors
 * if the plugins throw errors in their creation
 */

const rootDir =
  url.fileURLToPath(new URL(".", import.meta.url)) || process.cwd();

const gitRevision = childProcess
  .execSync("git rev-parse HEAD")
  .toString()
  .trim();

Sentry.init({
  dsn: instance.envVars.SENTRY_DSN,
  integrations: [
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    new RewriteFrames({
      root: rootDir,
    }),
  ],
  //release: "my-project-name@" + (process.env.npm_package_version ?? ""),
  release: gitRevision,
});

// Handles errors thrown by requests that do not have their own error handlers
// NOTE: Does not handle errors if an un-awaited promise is used in a request handling
instance.setErrorHandler(async (error, request, reply) => {
  if (
    (error.statusCode !== undefined && error.statusCode < 500) ||
    error.validation !== undefined
  ) {
    return reply.send(error);
  }
  // This is required to log errors with sentry
  Sentry.captureException(error);
  instance.log.error(error);
  if (error.statusCode !== undefined) {
    // Status code already set, so can just be sent without any modification
    return reply.send(error);
  }
  // Likely to be a code bug - something not handled. Therefore 500

  return reply.status(500).send({
    statusCode: 500,
    error: "Internal Server Error",
    message: error.message,
  });
});

// Register plugins that are not affected by versioning (versioning as in /v1/ )
// As they are functions, follow their definition for a deeper explanation
await instance.register(prismaPlugin);
await instance.register(stripePlugin);
await instance.register(discordRestPlugin, {
  discord: { token: instance.envVars.DISCORD_TOKEN },
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

// Cookie plugin for logging in on the web
await instance.register(fastifyCookie, {
  secret: instance.envVars.COOKIE_SECRET, // for cookies signature
  parseOptions: {},
} as FastifyCookieOptions);
await instance.register(fastifyCors, {
  origin: true,
  methods: ["GET", "PUT", "POST", "DELETE", "PATCH"],
  credentials: true,
});

await instance.register(authPlugin);

// Useful plugin for running auth
await instance.register(fastifyAuth);

await instance.register(metricsPlugin);

await instance.register(webhookAndLoggingPlugin);

await instance.register(sessionPlugin);

await instance.register(permissionPlugin);

await instance.register(interactionsPlugin);

await instance.register(authRoutePlugin);

await instance.register(versionOnePlugin, { prefix: "/v1" });

instance.listen(
  {
    port: instance.envVars.PORT,
    host: instance.envVars.HOST,
  },
  function (err, address) {
    // This seems to by typed incorrectly
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (err) {
      console.error(err);
      process.exit(1);
    }
    instance.log.info(`Server is now listening on ${address}`);
  }
);
