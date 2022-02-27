import {
  APIChatInputApplicationCommandGuildInteraction,
  APIChatInputApplicationCommandInteraction,
  APIInteraction,
  APIInteractionResponse,
  APIInteractionResponseChannelMessageWithSource,
  APIModalSubmitGuildInteraction,
  APIModalSubmitInteraction,
  ApplicationCommandType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import FastifyRawBody from "fastify-raw-body";
import { Forbidden } from "http-errors";
import { FastifyRequest } from "fastify";
import { verifyKey } from "discord-interactions";
import handleInfoCommand from "./commands/info";
import handleSendCommand from "./commands/send";
import handleModalSend from "./modals/handleModalSend";

const onlyInGuildResponse: APIInteractionResponseChannelMessageWithSource = {
  type: InteractionResponseType.ChannelMessageWithSource,
  data: {
    content: `:exclamation: This command is only available in guilds`,
    flags: MessageFlags.Ephemeral,
  },
};

class InteractionHandler {
  private readonly _client: FastifyInstance;
  private readonly _publicKey: string;
  private _commands: {
    [name: string]: {
      handler: (
        interaction:
          | APIChatInputApplicationCommandInteraction
          | APIChatInputApplicationCommandGuildInteraction,
        instance: FastifyInstance
      ) => Promise<APIInteractionResponse>;
      guildOnly?: boolean;
    };
  } = {};
  constructor(client: FastifyInstance, publicKey: string) {
    this._client = client;
    this._publicKey = publicKey;
  }
  addCommand(
    name: string,
    handler: (
      interaction: APIChatInputApplicationCommandInteraction,
      instance: FastifyInstance
    ) => Promise<APIInteractionResponse>
  ) {
    this._commands[name] = {
      handler,
    };
  }
  addGuildOnlyCommand(
    name: string,
    handler: (
      interaction: APIChatInputApplicationCommandGuildInteraction,
      instance: FastifyInstance
    ) => Promise<APIInteractionResponse>
  ) {
    this._commands[name] = {
      handler: handler as (
        interaction: APIChatInputApplicationCommandInteraction,
        instance: FastifyInstance
      ) => Promise<APIInteractionResponse>, // For some weird reason the types don't like to cross over
      guildOnly: true,
    };
  }

  async verify(request: FastifyRequest) {
    const signature = request.headers["x-signature-ed25519"];
    const timestamp = request.headers["x-signature-timestamp"];
    if (typeof signature !== "string" || typeof timestamp !== "string") {
      return false;
    }
    return verifyKey(request.rawBody!, signature, timestamp, this._publicKey);
  }

  async handleInteraction(
    interaction: APIInteraction
  ): Promise<APIInteractionResponse> {
    switch (interaction.type) {
      case InteractionType.Ping:
        return { type: InteractionResponseType.Pong };
      case InteractionType.ApplicationCommand:
        if (interaction.data.type === ApplicationCommandType.ChatInput) {
          return await this.handleCommands(
            interaction as APIChatInputApplicationCommandInteraction
          );
        } else {
          throw new Error(
            `No handler for command type ${interaction.data.type}`
          );
        }
      // @ts-ignore // TODO: Remove this when discord-api-types is updated
      case InteractionType.ModalSubmit:
        return await this.handleModalSubmit(
          interaction as APIModalSubmitInteraction
        );
      default:
        throw new Error(`No handler for interaction type ${interaction.type}`);
    }
  }
  async handleCommands(
    interaction: APIChatInputApplicationCommandInteraction
  ): Promise<APIInteractionResponse> {
    if (this._commands[interaction.data.name]) {
      if (
        this._commands[interaction.data.name].guildOnly &&
        !interaction.guild_id
      ) {
        return onlyInGuildResponse;
      }
      return this._commands[interaction.data.name].handler(
        interaction,
        this._client
      );
    }
    throw new Error(`No handler for command ${interaction.data.name}`);
  }
  async handleModalSubmit(
    interaction: APIModalSubmitInteraction
  ): Promise<APIInteractionResponse> {
    const id = interaction.data.custom_id.split(":")[0];
    switch (id) {
      case "send":
        // Guild only
        if (!interaction.guild_id) {
          return onlyInGuildResponse;
        }
        return await handleModalSend(
          interaction as APIModalSubmitGuildInteraction,
          this._client
        );
        break;

      default:
        break;
    }
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: "HELLO" }, // TODO: Handle modal submit
    };
  }
}

const interactionsPlugin = async (instance: FastifyInstance) => {
  const handler = new InteractionHandler(
    instance,
    process.env.DISCORD_INTERACTIONS_PUBLIC_KEY!
  );

  // Add commands to handler
  handler.addCommand("info", handleInfoCommand);
  handler.addGuildOnlyCommand("send", handleSendCommand);

  instance.register(FastifyRawBody, {
    field: "rawBody", // change the default request.rawBody property name
    global: false, // add the rawBody to every request. **Default true**
    encoding: false, // set it to false to set rawBody as a Buffer **Default utf8**
    runFirst: true, // get the body before any preParsing hook change/uncompress it. **Default false**
    routes: [], // array of routes, **`global`** will be ignored, wildcard routes not supported
  });

  instance.post<{ Body: APIInteraction }>(
    `/interactions`,
    {
      config: {
        rawBody: true,
      },
      preHandler: async (request, reply) => {
        if (!(await handler.verify(request))) {
          reply.send(new Forbidden("Invalid signature"));
          return;
        }
      },
    },

    async (request, reply) => {
      return await handler.handleInteraction(request.body);
    }
  );
};

export default interactionsPlugin;
