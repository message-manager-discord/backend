import fastify, { FastifyInstance } from "fastify";

import dotenv from "dotenv";

import { check } from "./envCheck";
import versionOnePlugin from "./v1";
import fastifyAuth from "fastify-auth";
import authPlugin from "./plugins/authentication";
import fastifyCors from "fastify-cors";
import prismaPlugin from "./plugins/prisma";
import discordRestPlugin from "./plugins/discord-rest";
import redisRestPlugin from "./plugins/redis";
import discordRedisCachePlugin from "./plugins/discordRedis";
import fastifyCookie, { FastifyCookieOptions } from "fastify-cookie";
import interactionsPlugin from "./interactions/index";

import authRoutePlugin from "./authRoutes";
const instance: FastifyInstance = fastify({
  logger: true,
});

const requiredVars = [
  "UUID_NAMESPACE",
  "COOKIE_SECRET",
  "DISCORD_TOKEN",
  "DISCORD_CACHE_REDIS_HOST",
  "DISCORD_CACHE_REDIS_PORT",
  "BACKEND_REDIS_HOST",
  "BACKEND_REDIS_PORT",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_INTERACTIONS_PUBLIC_KEY",
  "BASE_API_URL",
];

dotenv.config(); // Load environment variables from .env file

check(requiredVars); // Confirm that all required environment variables are set

// These are plugins that are separate from versioning
instance.register(prismaPlugin);
instance.register(discordRestPlugin, {
  detritus: { token: process.env.DISCORD_TOKEN },
});
instance.register(redisRestPlugin, {
  redis: {
    host: process.env.BACKEND_REDIS_HOST,
    port: process.env.BACKEND_REDIS_PORT,
  },
});
instance.register(discordRedisCachePlugin, {
  redis: {
    host: process.env.DISCORD_CACHE_REDIS_HOST,
    port: process.env.DISCORD_CACHE_REDIS_PORT,
  },
});

instance.register(fastifyCookie, {
  secret: process.env.COOKIE_SECRET, // for cookies signature
  parseOptions: {}, // options for parsing cookies
} as FastifyCookieOptions);
instance.register(fastifyCors, {
  origin: true,
  methods: ["GET", "PUT", "POST", "DELETE", "PATCH"],
  credentials: true,
});

instance.register(authPlugin);
instance.register(fastifyAuth);

instance.register(interactionsPlugin);

instance.register(authRoutePlugin);

instance.register(versionOnePlugin, { prefix: "/v1" });

instance.listen(4000, function (err, address) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  // Server is now listening on ${address}
});
