import { PrismaPg } from "@prisma/adapter-pg";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

import { PrismaClient } from "../generated/prisma/client.js";

const createPrismaClient = () => {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });

  return new PrismaClient({ adapter });
};

export type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

declare module "fastify" {
  interface FastifyInstance {
    prisma: ExtendedPrismaClient;
  }
}

const prismaPlugin: FastifyPluginAsync = fp(async (server) => {
  const prisma = createPrismaClient();

  await prisma.$connect();

  server.decorate("prisma", prisma);

  // Cleanup on close
  server.addHook("onClose", async (server) => {
    await server.prisma.$disconnect();
  });
});

export default prismaPlugin;
