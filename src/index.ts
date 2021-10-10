import fastify, {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import fastifyJWT from "fastify-jwt";
import { config } from "dotenv";
import analyticsRoutePlugin from "./analytics";
import prismaPlugin from "./prisma";
const f: FastifyInstance = fastify({
  logger: true,
});

config();

f.register(prismaPlugin);
if (!process.env.PUBLIC_KEY) {
  console.error(new Error("Environmental variable 'PUBLIC_KEY' not set!"));
  process.exit(1);
}

f.register(fastifyJWT, {
  secret: {
    private: "-----BEGIN PRIVATE KEY----------END PRIVATE KEY----", // fake "key" NOTE DO NOT SIGN JWT's IN THIS APP
    public: process.env.PUBLIC_KEY,
  },
});

f.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify({ algorithms: ["ES256"] });
  } catch (err) {
    reply.send(err);
  }
});

// NOTE: f.addHook and f.register(fastifyJWT, ......) MUST be before ANY other routes, so that user is always defined

f.register(analyticsRoutePlugin);

f.get("/", async function (request, reply) {
  return { h: 1 };
});

f.listen(3000, function (err, address) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  // Server is now listening on ${address}
});
