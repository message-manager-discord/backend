import fastify, { FastifyInstance } from "fastify";
import fastifyCookie, { FastifyCookieOptions } from "fastify-cookie";
import fastifyAuth from "fastify-auth";
import { config } from "dotenv";
import analyticsRoutePlugin from "./routes/analytics";
import authRoutePlugin from "./routes/auth";
import prismaPlugin from "./plugins/prisma";
import detritusPlugin from "./plugins/detritus-rest";
import redisPlugin from "./plugins/redis";
import authPlugin from "./plugins/authentication";
import rootPlugin from "./routes/rootTesting";
const f: FastifyInstance = fastify({
  logger: true,
});

config();

if (!process.env.UUID_NAMESPACE) {
  console.error(new Error("Environmental variable 'UUID_NAMESPACE' not set!"));
  process.exit(1);
}
if (!process.env.COOKIE_SECRET) {
  console.error(new Error("Environmental variable 'COOKIE_SECRET' not set!"));
  process.exit(1);
}
if (!process.env.DISCORD_TOKEN) {
  console.error(new Error("Environmental variable 'DISCORD_TOKEN' not set!"));
  process.exit(1);
}

if (!process.env.BACKEND_REDIS_HOST || !process.env.BACKEND_REDIS_PORT) {
  console.error(
    new Error(
      "Environmental variables 'BACKEND_REDIS_HOST' or 'BACKEND_REDIS_PORT' not set!"
    )
  );
  process.exit(1);
}

if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
  console.error(
    new Error(
      "Environmental variable 'DISCORD_CLIENT_ID' or 'DISCORD_CLIENT_SECRET' not set!"
    )
  );
  process.exit(1);
}
if (!process.env.BASE_API_URL) {
  console.error(new Error("Environmental variable 'BASE_API_URL' not set!"));
  process.exit(1);
}

f.register(prismaPlugin);
f.register(detritusPlugin, { detritus: { token: process.env.DISCORD_TOKEN } });
f.register(redisPlugin, {
  redis: {
    host: process.env.BACKEND_REDIS_HOST,
    port: process.env.BACKEND_REDIS_PORT,
  },
});

f.register(fastifyCookie, {
  secret: process.env.COOKIE_SECRET, // for cookies signature
  parseOptions: {}, // options for parsing cookies
} as FastifyCookieOptions);

f.register(authPlugin);
f.register(fastifyAuth);
f.register(rootPlugin);

f.register(analyticsRoutePlugin);
f.register(authRoutePlugin);

f.listen(3000, function (err, address) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  // Server is now listening on ${address}
});
