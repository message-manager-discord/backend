import prismaClientImport from "@prisma/client";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { fieldEncryptionMiddleware } from "prisma-field-encryption";

declare module "fastify" {
  interface FastifyInstance {
    prisma: prismaClientImport.PrismaClient;
  }
}

const prismaPlugin: FastifyPluginAsync = fp(async (server) => {
  const prisma = new prismaClientImport.PrismaClient();

  // Add encryption middleware
  prisma.$use(fieldEncryptionMiddleware());

  await prisma.$connect();

  server.decorate("prisma", prisma);

  server.addHook("onClose", async (server) => {
    await server.prisma.$disconnect();
  });
});

export default prismaPlugin;
