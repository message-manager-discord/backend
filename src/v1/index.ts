import { FastifyInstance } from "fastify";
import fastifySwagger from "fastify-swagger";
import rootPlugin from "./routes/rootTesting";
import userPlugin from "./routes/user";
import analyticsRoutePlugin from "./routes/analytics";

const versionOnePlugin = async (instance: FastifyInstance) => {
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
    $id: "responses.notfound",
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

  instance.register(fastifySwagger, {
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

  instance.register(rootPlugin);
  instance.register(userPlugin);

  instance.register(analyticsRoutePlugin);
};

export default versionOnePlugin;
