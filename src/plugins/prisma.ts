// Plugin that registers the prisma client to the fastify instance (prisma is the database ORM)
// The Prisma Database schema is in /prisma/schema.prisma

import { PrismaClient } from "@prisma/client";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { fieldEncryptionExtension } from "prisma-field-encryption";

import { migrate } from "../primsa-field-encryption-migrations";

// Extend the fastify instance with the prisma client
declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

const prismaPlugin: FastifyPluginAsync = fp(async (server) => {
  // Register encryption middleware to prisma client - this will encrypt all fields with the prisma schema
  // comment of "/// @encrypted" on them
  // Create a Prisma client extended with encryption support and export the resulting client
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const prisma = new PrismaClient().$extends(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    fieldEncryptionExtension()
  ) as PrismaClient;

  await migrate(prisma);

  await prisma.$connect();

  server.decorate("prisma", prisma);

  // Cleanup on close
  server.addHook("onClose", async (server) => {
    await server.prisma.$disconnect();
  });
});

export default prismaPlugin;
