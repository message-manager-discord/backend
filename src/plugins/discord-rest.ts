import { REST } from "@discordjs/rest";
import { FastifyInstance, FastifyPluginOptions } from "fastify";
import fp from "fastify-plugin";

import DiscordOauthRequests from "../discordOauth";

declare module "fastify" {
  interface FastifyInstance {
    restClient: REST;
    discordOauthRequests: DiscordOauthRequests;
  }
}

interface RestPluginOptions extends FastifyPluginOptions {
  discord?: {
    token?: string;
  };
}

const discordRestPlugin = fp(
  // eslint-disable-next-line @typescript-eslint/require-await
  async (server: FastifyInstance, options?: RestPluginOptions) => {
    if (options?.discord?.token === undefined) {
      throw new Error("Token not set");
    }
    const restClient = new REST({
      version: "9",
    }).setToken(options.discord.token);

    server.decorate("restClient", restClient);
    const discordOauthRequests = new DiscordOauthRequests(server);
    server.decorate("discordOauthRequests", discordOauthRequests);
  }
);

export default discordRestPlugin;
