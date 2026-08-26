// Plugin that registers the prisma client to the fastify instance (prisma is the database ORM)
// The Prisma Database schema is in /prisma/schema.prisma

import prismaClientImport from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { fieldEncryptionExtension } from "prisma-field-encryption";

const createPrismaClient = () =>
  new prismaClientImport.PrismaClient().$extends(fieldEncryptionExtension());

export type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

declare module "fastify" {
  interface FastifyInstance {
    prisma: ExtendedPrismaClient;
  }
}

const prismaPlugin: FastifyPluginAsync = fp(async (server) => {
  // Register field encryption extension - this will encrypt all fields with
  // the "/// @encrypted" comment in the Prisma schema.
  const prisma = createPrismaClient();

  // Register encryption middleware to prisma client - this will encrypt all fields with the prisma schema
  // comment of "/// @encrypted" on them

  await prisma.$connect();

  server.decorate("prisma", prisma);

  // Cleanup on close
  server.addHook("onClose", async (server) => {
    await server.prisma.$disconnect();
  });
});

export default prismaPlugin;
