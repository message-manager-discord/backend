import { GatewayClient } from "redis-discord-cache";
import * as winston from "winston";
import * as promClient from "prom-client";
import fastify from "fastify";
import * as Sentry from "@sentry/node";

const HOST = process.env.REDIS_HOST;
const PORT_string = process.env.REDIS_PORT;
const TOKEN = process.env.DISCORD_TOKEN;
const METRICS_PORT_string = process.env.METRICS_PORT;
const METRICS_AUTH = process.env.METRICS_AUTH;

if (!PORT_string || !TOKEN) {
  throw new Error("Missing environment variables");
}
let PORT: number;
try {
  PORT = parseInt(PORT_string);
} catch (e) {
  throw new Error("Port must be a valid number");
}
let METRICS_PORT: number | undefined;
try {
  METRICS_PORT = METRICS_PORT_string
    ? parseInt(METRICS_PORT_string)
    : undefined;
} catch (e) {
  METRICS_PORT = undefined;
}
let LOGGING_LEVEL = process.env.LOGGING_LEVEL;

if (!LOGGING_LEVEL) {
  LOGGING_LEVEL = "info";
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,
});

// Logger

const logger = winston.createLogger({
  level: LOGGING_LEVEL,
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
      handleExceptions: true,
    }),
  ],
  exitOnError: false,
});

const handlePacketError = (error: unknown) => {
  Sentry.captureException(error);
};

// Metrics

const metricsPrefix = "discord_gateway_";
// Gauge for the number of guilds
const guildsGauge = new promClient.Gauge({
  name: `${metricsPrefix}guild_count`,
  help: "Number of guilds",
});
// Counter for the number of gateway events
const eventsCounter = new promClient.Counter({
  name: `${metricsPrefix}gateway_events_count`,
  help: "Number of gateway events",
  labelNames: ["name"],
});
// Counter for the number of redis commands
const redisCommandsCounter = new promClient.Counter({
  name: `${metricsPrefix}redis_commands_count`,
  help: "Number of redis commands",
  labelNames: ["name"],
});

// Handler for gateway events - metrics
const handleGatewayEvent = async ({ name }: { name: string }) => {
  eventsCounter.inc({ name });
};
// Handler for redis commands - metrics
const handleRedisCommand = async ({ name }: { name: string }) => {
  redisCommandsCounter.inc({ name });
};

const shardCount = 1; // TODO ADD INPUT
const shardWaitConnect = 30; // TODO FIGURE OUT HOW TO WORK THIS OUT
const shards: GatewayClient[] = [];

async function startShards(token: string) {
  for (let shardId = 0; shardId < shardCount; shardId++) {
    const shard = new GatewayClient({
      redis: { host: HOST, port: PORT },
      discord: {
        token,
        presence: {
          status: "online",
        },
        shardCount,
        shardId,
      },
      logger,
      metrics: {
        onGatewayEvent: handleGatewayEvent,
        onRedisCommand: handleRedisCommand,
      },
      onErrorInPacketHandler: handlePacketError,
    });
    await shard.connect();
    shards.push(shard);
    //TODO wait for ratelimiting
  }
}
startShards(TOKEN);

// Fetch guild count from client every 15 seconds and update metric gauge
setInterval(async () => {
  // Check if client is connected and guild loaded (mostly)
  let guildCount = 0;
  shards.forEach(async (shard) => {
    const shardGuildCount = await shard.getGuildCount();
    guildCount += shardGuildCount;
  });

  guildsGauge.set(guildCount);
  // TODO Prevent this from being 0 on startup (some kind of tracking state and guild counts to get when all guilds loaded )
}, 15 * 1000);

if (METRICS_PORT) {
  // If metrics port is defined create metrics server

  // Create web server for metrics endpoint
  const metricsServer = fastify();
  // Add metrics endpoint - authorization header must match METRICS_AUTH env variable
  metricsServer.get(
    "/metrics",
    {
      preHandler: async (request, reply) => {
        if (
          request.headers.authorization?.replace(/BEARER\s*/i, "") !==
          METRICS_AUTH
        ) {
          reply.code(401).send("Unauthorized");
        }
      },
    },
    async (request, reply) => {
      reply.type("text/plain").send(await promClient.register.metrics());
    }
  );

  // Start metrics server
  logger.info("Starting metrics server");
  metricsServer.listen(METRICS_PORT);
}
