// Discord.js' rest client used for API requests to the Discord API
// Docs: https://discord.js.org/#/docs/rest/main/general/welcome
// A client is used to handle parsing / ratelimits / errors / and type safety

import { REST } from "@discordjs/rest";
import { FastifyInstance, FastifyPluginOptions } from "fastify";
import fp from "fastify-plugin";

import DiscordOauthRequests from "../discordOauth";

// Extend the fastify instance with the rest client
declare module "fastify" {
  interface FastifyInstance {
    // Discord.js rest client
    restClient: REST;
    // A custom client for handling oauth requests
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
      // The API version is v9, this MUST be the same as the version running on the gateway instance
      version: "9",
    }).setToken(options.discord.token);

    server.decorate("restClient", restClient);
    const discordOauthRequests = new DiscordOauthRequests(server);
    server.decorate("discordOauthRequests", discordOauthRequests);
  }
);

export default discordRestPlugin;
