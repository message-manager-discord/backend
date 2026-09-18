import { PrismaPg } from "@prisma/adapter-pg";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { fieldEncryptionExtension } from "prisma-field-encryption";

import { PrismaClient } from "../generated/prisma/client.js";

const createPrismaClient = () => {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });

  // prisma-field-encryption's extension is typed as `(client: any) => ...` with empty
  // InternalArgs, which makes Prisma 7's `$extends` collapse every query result type to
  // `any`. The extension only adds `query` handlers (same args/results, transformed
  // data), so the base `PrismaClient` type is an accurate static description of it.
  return new PrismaClient({ adapter }).$extends(
    fieldEncryptionExtension(),
  ) as unknown as PrismaClient;
};

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

  await prisma.$connect();

  server.decorate("prisma", prisma);

  // Cleanup on close
  server.addHook("onClose", async (server) => {
    await server.prisma.$disconnect();
  });
});

export default prismaPlugin;
