import fp from "fastify-plugin";

import { FastifyInstance, FastifyPluginOptions } from "fastify";

import { Client } from "detritus-client-rest";
import DiscordOauthRequests from "../discordOauth";

declare module "fastify" {
  interface FastifyInstance {
    restClient: Client;
    discordOauthRequests: DiscordOauthRequests;
  }
}

interface RestPluginOptions extends FastifyPluginOptions {
  detritus?: {
    token?: string;
  };
}

const discordRestPlugin = fp(
  // eslint-disable-next-line @typescript-eslint/require-await
  async (server: FastifyInstance, options?: RestPluginOptions) => {
    if (options?.detritus?.token === undefined) {
      throw new Error("Token not set");
    }
    const restClient = new Client(options.detritus.token);

    server.decorate("restClient", restClient);
    const discordOauthRequests = new DiscordOauthRequests(server);
    server.decorate("discordOauthRequests", discordOauthRequests);
  }
);

export default discordRestPlugin;
