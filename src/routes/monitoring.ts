import type { FastifyInstance } from "fastify";

const discordShardMonitorPlugin = (instance: FastifyInstance) => {
  instance.get("/health/shards", () => {
    const shardStatus = instance.redisGuildManager.shardsActive;

    if (!shardStatus.isValid) {
      return { shards: [] };
    }

    const shards = Object.entries(shardStatus.shards).map(([id, active]) => ({
      id: Number(id),
      active,
    }));

    return { shards };
  });
};

export default discordShardMonitorPlugin;
