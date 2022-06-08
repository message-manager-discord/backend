import { FastifyInstance, FastifyPluginOptions } from "fastify";
import fp from "fastify-plugin";
import { createRedisClient, GuildManager } from "redis-discord-cache";

declare module "fastify" {
  interface FastifyInstance {
    redisGuildManager: GuildManager;
  }
}

interface DiscordRedisCachePluginOptions extends FastifyPluginOptions {
  redis?: {
    host?: string;
    port?: number;
  };
}

const discordRedisCachePlugin = fp(
  // eslint-disable-next-line @typescript-eslint/require-await
  async (server: FastifyInstance, options?: DiscordRedisCachePluginOptions) => {
    if (
      options?.redis?.port === undefined ||
      options?.redis?.host === undefined
    ) {
      throw new Error("Host or port not set");
    }
    server.log.info(
      `Connecting to redis discord gateway cache at ${options.redis.host}:${options.redis.port}`
    );
    const redisGuildManager = createRedisClient(options.redis);

    server.decorate("redisGuildManager", redisGuildManager);
  }
);

export default discordRedisCachePlugin;
