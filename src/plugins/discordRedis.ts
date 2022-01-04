import { createRedisClient, GuildManager } from "redis-discord-cache";

import { FastifyInstance, FastifyPluginOptions } from "fastify";
import fp from "fastify-plugin";

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
  async (server: FastifyInstance, options?: DiscordRedisCachePluginOptions) => {
    if (!options?.redis?.port || !options?.redis?.host) {
      throw new Error("Host or port not set");
    }
    const redisGuildManager = createRedisClient(options.redis);

    server.decorate("redisGuildManager", redisGuildManager);
  }
);

export default discordRedisCachePlugin;
