import fastifyRateLimit from "@fastify/rate-limit";
import fastifySwagger from "@fastify/swagger";
import { FastifyInstance } from "fastify";
import Redis from "ioredis";

import internalPlugin from "./routes/internal";
import reportPlugin from "./routes/reports";
import rootPlugin from "./routes/rootTesting";
import userPlugin from "./routes/user";
import { schemas } from "./types";

const versionOnePlugin = async (instance: FastifyInstance) => {
  instance.addSchema({
    $id: "responses.badRequest",
    type: "object",
    properties: {
      statusCode: { type: "integer", example: 400 },
      error: { type: "string", example: "Bad Request" },
      message: { type: "string", example: "Missing querystring value" },
    },
  });
  instance.addSchema({
    $id: "responses.unauthorized",
    type: "object",
    properties: {
      statusCode: { type: "integer", example: 401 },
      error: { type: "string", example: "Unauthorized" },
      message: { type: "string", example: "Missing authorization" },
    },
  });
  instance.addSchema({
    $id: "responses.forbidden",
    type: "object",
    properties: {
      statusCode: { type: "integer", example: 403 },
      error: { type: "string", example: "Forbidden" },
      message: { type: "string", example: "Missing permissions" },
    },
  });

  instance.addSchema({
    $id: "responses.notFound",
    type: "object",
    properties: {
      statusCode: { type: "integer", example: 404 },
      error: { type: "string", example: "Not Found" },
      message: { type: "string", example: "Entity not found" },
    },
  });

  instance.addSchema({
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

  schemas.forEach((schema) => instance.addSchema(schema));

  await instance.register(fastifySwagger, {
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

  instance.addHook("onRequest", instance.addAuthentication);

  await instance.register(fastifyRateLimit, {
    global: true,
    max: 80, // 80 requests per minute
    timeWindow: 60 * 1000, // 1 minute
    cache: 10000,
    redis: new Redis({
      connectionName: "my-connection-name",
      host: instance.envVars.BACKEND_REDIS_HOST,
      port: instance.envVars.BACKEND_REDIS_PORT,
      connectTimeout: 1000,
      maxRetriesPerRequest: 1,
    }),

    keyGenerator: (request) =>
      request.user?.userId !== undefined ? request.user.userId : request.ip,
    enableDraftSpec: true,
  });

  await instance.register(rootPlugin);
  await instance.register(userPlugin);
  await instance.register(reportPlugin);
  await instance.register(internalPlugin);
};

export default versionOnePlugin;
