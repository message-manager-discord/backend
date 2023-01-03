import envSchema from "env-schema";
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

const schemaForEnv = {
  type: "object",
  required: [
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
    "SITE_URL",
    "METRICS_AUTH_TOKEN",
    "AVATAR_URL",
    "PRISMA_FIELD_ENCRYPTION_KEY",
    "PORT",
    "HOST",
    "NO_MIGRATION_AFTER",
    "SENTRY_DSN",
    "API_ADMIN_IDS",
    "INTERNAL_TOKEN",
    "DEFAULT_STAFF_PROFILE_NAME",
  ],
  properties: {
    UUID_NAMESPACE: {
      type: "string",
    },
    COOKIE_SECRET: {
      type: "string",
    },
    DISCORD_TOKEN: {
      type: "string",
    },
    DISCORD_CACHE_REDIS_HOST: {
      type: "string",
    },
    DISCORD_CACHE_REDIS_PORT: {
      type: "number",
    },
    BACKEND_REDIS_HOST: {
      type: "string",
    },
    BACKEND_REDIS_PORT: {
      type: "number",
    },
    DISCORD_CLIENT_ID: {
      type: "string",
    },
    DISCORD_CLIENT_SECRET: {
      type: "string",
    },
    DISCORD_INTERACTIONS_PUBLIC_KEY: {
      type: "string",
    },
    SITE_URL: {
      type: "string",
    },
    METRICS_AUTH_TOKEN: {
      type: "string",
    },
    AVATAR_URL: {
      type: "string",
    },

    PORT: {
      type: "number",
    },
    HOST: {
      type: "string",
    },
    PRISMA_FIELD_ENCRYPTION_KEY: {
      type: "string",
    },
    NO_MIGRATION_AFTER: {
      type: "number",
    },
    SENTRY_DSN: {
      type: "string",
    },
    API_ADMIN_IDS: {
      type: "string",
    },
    INTERNAL_TOKEN: {
      type: "string",
    },
    DEFAULT_STAFF_PROFILE_NAME: {
      type: "string",
    },
  },
};

interface EnvVars {
  UUID_NAMESPACE: string;
  COOKIE_SECRET: string;
  DISCORD_TOKEN: string;
  DISCORD_CACHE_REDIS_HOST: string;
  DISCORD_CACHE_REDIS_PORT: number;
  BACKEND_REDIS_HOST: string;
  BACKEND_REDIS_PORT: number;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_INTERACTIONS_PUBLIC_KEY: string;
  SITE_URL: string;
  METRICS_AUTH_TOKEN: string;
  AVATAR_URL: string;
  PORT: number;
  HOST: string;
  PRISMA_FIELD_ENCRYPTION_KEY: string;
  NO_MIGRATION_AFTER: number;
  SENTRY_DSN: string;
  API_ADMIN_IDS: string;
  INTERNAL_TOKEN: string;
  DEFAULT_STAFF_PROFILE_NAME: string;
}

declare module "fastify" {
  interface FastifyInstance {
    envVars: EnvVars;
  }
}
// eslint-disable-next-line @typescript-eslint/require-await
const envPlugin = fp(async (instance: FastifyInstance) => {
  const envVars = envSchema<EnvVars>({ schema: schemaForEnv, dotenv: true });
  instance.decorate("envVars", envVars);
});

export default envPlugin;
