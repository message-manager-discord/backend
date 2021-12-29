import fp from "fastify-plugin";

import { FastifyInstance, FastifyPluginOptions } from "fastify";

import { Client } from "detritus-client-rest";

declare module "fastify" {
  interface FastifyInstance {
    restClient: Client;
  }
}

interface RestPluginOptions extends FastifyPluginOptions {
  detritus?: {
    token?: string;
  };
}

const detritusRestPlugin = fp(
  async (server: FastifyInstance, options?: RestPluginOptions) => {
    if (!options?.detritus?.token) {
      throw new Error("Token not set");
    }
    const restClient = new Client(options.detritus.token);

    server.decorate("restClient", restClient);
  }
);

export default detritusRestPlugin;
