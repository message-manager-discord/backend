import fastify, { FastifyInstance } from "fastify";
import fastifyCookie, { FastifyCookieOptions } from "fastify-cookie";
import fastifyAuth from "fastify-auth";
import fastifySwagger from "fastify-swagger";
import dotenv from "dotenv";
import analyticsRoutePlugin from "./routes/analytics";
import authRoutePlugin from "./routes/auth";
import prismaPlugin from "./plugins/prisma";
import detritusPlugin from "./plugins/discord-rest";
import redisPlugin from "./plugins/redis";
import authPlugin from "./plugins/authentication";
import rootPlugin from "./routes/rootTesting";
import userPlugin from "./routes/user";
import fastifyCors from "fastify-cors";
import discordRedisCachePlugin from "./plugins/discordRedis";
import { check } from "./envCheck";
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

f.addSchema({
  $id: "responses.unauthorized",
  type: "object",
  properties: {
    statusCode: { type: "integer", example: 401 },
    error: { type: "string", example: "Unauthorized" },
    message: { type: "string", example: "Missing authorization" },
  },
});
f.addSchema({
  $id: "responses.forbidden",
  type: "object",
  properties: {
    statusCode: { type: "integer", example: 403 },
    error: { type: "string", example: "Forbidden" },
    message: { type: "string", example: "Missing permissions" },
  },
});

f.addSchema({
  $id: "responses.notfound",
  type: "object",
  properties: {
    statusCode: { type: "integer", example: 404 },
    error: { type: "string", example: "Not Found" },
    message: { type: "string", example: "Entity not found" },
  },
});

f.addSchema({
  $id: "models.user",
  type: "object",
  properties: {
    id: { type: "string", example: "123456789012345678" },
    username: { type: "string", example: "example" },
    avatar: {
      type: "string",
      nullable: true,
      example: "b09d7fd2ec0f27e29d000f4fd62d8ea5",
    },
    discriminator: { type: "string", example: "0000" },
    accent_color: {
      type: "number",
      nullable: true,
      optional: true,
      example: 13599461,
    },
    staff: { type: "boolean", example: false },
  },
});

f.register(prismaPlugin);
f.register(detritusPlugin, { detritus: { token: process.env.DISCORD_TOKEN } });
f.register(redisPlugin, {
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

f.register(fastifySwagger, {
  routePrefix: "/docs",
  openapi: {
    info: {
      title: "Message Manager API Docs",
      description: "Endpoints for accessing the message manager api",
      version: "1.0.0a",
    },
    servers: [
      {
        url: "http://localhost",
      },
    ],
    components: {
      securitySchemes: {
        apiKey: {
          type: "apiKey",
          name: "_HOST-session",
          in: "cookie",
        },
      },
    },
    tags: [
      {
        name: "user",
        description:
          "User related endpoints - this is for the user authorized unless the user is staff",
      },
    ],
  },
  uiConfig: {},
  hideUntagged: true,
  exposeRoute: true,
});

f.register(fastifyCors, {
  origin: true,
  methods: ["GET", "PUT", "POST", "DELETE", "PATCH"],
  credentials: true,
});

f.register(authPlugin);
f.register(fastifyAuth);
f.register(rootPlugin);
f.register(userPlugin);

f.register(analyticsRoutePlugin);
f.register(authRoutePlugin);

f.listen(3000, function (err, address) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  // Server is now listening on ${address}
});
