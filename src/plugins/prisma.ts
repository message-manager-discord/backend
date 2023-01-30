// Plugin that registers the prisma client to the fastify instance (prisma is the database ORM)
// The Prisma Database schema is in /prisma/schema.prisma

import prismaClientImport from "@prisma/client";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { fieldEncryptionMiddleware } from "prisma-field-encryption";

// Extend the fastify instance with the prisma client
declare module "fastify" {
  interface FastifyInstance {
    prisma: prismaClientImport.PrismaClient;
  }
}

const prismaPlugin: FastifyPluginAsync = fp(async (server) => {
  const prisma = new prismaClientImport.PrismaClient();

  // Register encryption middleware to prisma client - this will encrypt all fields with the prisma schema
  // comment of "/// @encrypted" on them
  prisma.$use(fieldEncryptionMiddleware());

  await prisma.$connect();

  server.decorate("prisma", prisma);

  // Cleanup on close
  server.addHook("onClose", async (server) => {
    await server.prisma.$disconnect();
  });
});

export default prismaPlugin;
