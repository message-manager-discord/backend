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
const f: FastifyInstance = fastify({
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
  "BASE_API_URL",
];

dotenv.config(); // Load environment variables from .env file

check(requiredVars); // Confirm that all required environment variables are set

// These are plugins that are separate from versioning
f.register(prismaPlugin);
f.register(discordRestPlugin, {
  detritus: { token: process.env.DISCORD_TOKEN },
});
f.register(redisRestPlugin, {
  redis: {
    host: process.env.BACKEND_REDIS_HOST,
    port: process.env.BACKEND_REDIS_PORT,
  },
});
f.register(discordRedisCachePlugin, {
  redis: {
    host: process.env.DISCORD_CACHE_REDIS_PORT,
    port: process.env.DISCORD_CACHE_REDIS_HOST,
  },
});

f.register(fastifyCookie, {
  secret: process.env.COOKIE_SECRET, // for cookies signature
  parseOptions: {}, // options for parsing cookies
} as FastifyCookieOptions);
f.register(fastifyCors, {
  origin: true,
  methods: ["GET", "PUT", "POST", "DELETE", "PATCH"],
  credentials: true,
});

f.register(authPlugin);
f.register(fastifyAuth);

f.register(versionOnePlugin, { prefix: "/v1" });

f.listen(3000, function (err, address) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  // Server is now listening on ${address}
});
