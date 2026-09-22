import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import envPlugin from "../../plugins/envCheck.js";

// envCheck validates process.env merged with the local .env, so every variable is
// stubbed explicitly here. Without that, results would depend on whether a .env
// file happens to exist, and CI has none.
const completeEnv: Record<string, string> = {
  UUID_NAMESPACE: "test-namespace",
  COOKIE_SECRET: "test-cookie-secret",
  DISCORD_TOKEN: "test-discord-token",
  DISCORD_CACHE_REDIS_HOST: "localhost",
  DISCORD_CACHE_REDIS_PORT: "6379",
  BACKEND_REDIS_HOST: "localhost",
  BACKEND_REDIS_PORT: "6379",
  DISCORD_CLIENT_ID: "1234567890",
  DISCORD_CLIENT_SECRET: "test-client-secret",
  DISCORD_INTERACTIONS_PUBLIC_KEY: "ab".repeat(32),
  SITE_URL: "http://localhost",
  METRICS_AUTH_TOKEN: "test-metrics-token",
  AVATAR_URL: "http://localhost/avatar.webp",
  PORT: "3000",
  HOST: "localhost",
  NO_MIGRATION_AFTER: "1649923675917",
  SENTRY_DSN: "http://sentry.invalid",
  API_ADMIN_IDS: "111,222",
  INTERNAL_TOKEN: "test-internal-token",
  DEFAULT_STAFF_PROFILE_NAME: "test-profile",
};

const useEnv = (overrides: Record<string, string>) => {
  for (const [key, value] of Object.entries({ ...completeEnv, ...overrides })) {
    vi.stubEnv(key, value);
  }
};

const boot = async (): Promise<FastifyInstance> => {
  const instance = Fastify();
  await instance.register(envPlugin);
  await instance.ready();
  return instance;
};

describe("envCheck", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("boots with a complete environment", async () => {
    useEnv({});
    const instance = await boot();

    expect(instance.envVars.METRICS_AUTH_TOKEN).toBe("test-metrics-token");
    expect(instance.envVars.INTERNAL_TOKEN).toBe("test-internal-token");

    await instance.close();
  });

  // A blank token would otherwise boot and then reject every request, turning a
  // misconfiguration into an outage that is hard to trace back to its cause.
  it("refuses to boot with a blank METRICS_AUTH_TOKEN", async () => {
    useEnv({ METRICS_AUTH_TOKEN: "" });

    await expect(boot()).rejects.toThrow(/METRICS_AUTH_TOKEN/);
  });

  it("refuses to boot with a blank INTERNAL_TOKEN", async () => {
    useEnv({ INTERNAL_TOKEN: "" });

    await expect(boot()).rejects.toThrow(/INTERNAL_TOKEN/);
  });
});
