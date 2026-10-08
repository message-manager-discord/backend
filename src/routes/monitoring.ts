import type { FastifyInstance } from "fastify";

const discordShardMonitorPlugin = (instance: FastifyInstance) => {
  instance.get(
    "/health/status",
    {
      preHandler: async (request, reply) => {
        const token = request.headers.authorization;

        if (token !== `Bearer ${process.env.HEALTH_API_TOKEN}`) {
          return reply.code(401).send({ error: "Unauthorized" });
        }
      },
    },
    () => {
      const shardStatus = instance.redisGuildManager.shardsActive;

      if (!shardStatus.isValid) {
        return {
          status: "major_outage",
          shards: [],
        };
      }

      const shards = Object.entries(shardStatus.shards).map(([id, active]) => ({
        id: Number(id),
        active,
      }));

      const activeShards = shards.filter((shard) => shard.active).length;

      let status: "operational" | "degraded" | "major_outage";

      if (activeShards === shards.length) {
        status = "operational";
      } else if (activeShards === 0) {
        status = "major_outage";
      } else {
        status = "degraded";
      }

      return {
        status,
        shards,
      };
    },
  );
};

export default discordShardMonitorPlugin;
