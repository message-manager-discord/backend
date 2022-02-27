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
import { InternalInteraction } from "./interaction";
import {
  CustomError,
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../errors";

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
        interaction: InternalInteraction<
          | APIChatInputApplicationCommandInteraction
          | APIChatInputApplicationCommandGuildInteraction
        >,
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
      interaction: InternalInteraction<APIChatInputApplicationCommandInteraction>,
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
      interaction: InternalInteraction<APIChatInputApplicationCommandGuildInteraction>,
      instance: FastifyInstance
    ) => Promise<APIInteractionResponse>
  ) {
    this._commands[name] = {
      handler: handler as (
        interaction: InternalInteraction<APIChatInputApplicationCommandInteraction>,
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
    internalInteraction: InternalInteraction<APIInteraction>
  ): Promise<APIInteractionResponse> {
    const interaction = internalInteraction.interaction;
    switch (interaction.type) {
      case InteractionType.Ping:
        return { type: InteractionResponseType.Pong };
      case InteractionType.ApplicationCommand:
        if (interaction.data.type === ApplicationCommandType.ChatInput) {
          return await this.handleCommands(
            internalInteraction as InternalInteraction<APIChatInputApplicationCommandInteraction>
          );
        } else {
          throw new UnexpectedFailure(
            InteractionOrRequestFinalStatus.APPLICATION_COMMAND_TYPE_MISSING_HANDLER,
            `No handler for command type ${interaction.data.type}`
          );
        }
      // @ts-ignore // TODO: Remove this when discord-api-types is updated
      case InteractionType.ModalSubmit:
        return await this.handleModalSubmit(
          internalInteraction as InternalInteraction<APIModalSubmitInteraction>
        );
      default:
        throw new UnexpectedFailure(
          InteractionOrRequestFinalStatus.INTERACTION_TYPE_MISSING_HANDLER,
          `No handler for interaction type ${interaction.type}`
        );
    }
  }
  async handleCommands(
    internalInteraction: InternalInteraction<APIChatInputApplicationCommandInteraction>
  ): Promise<APIInteractionResponse> {
    const interaction = internalInteraction.interaction;

    if (this._commands[interaction.data.name]) {
      this._client.metrics.commandsUsed.inc({ command: interaction.data.name });
      if (
        this._commands[interaction.data.name].guildOnly &&
        !interaction.guild_id
      ) {
        return onlyInGuildResponse;
      }
      const data = this._commands[interaction.data.name].handler(
        internalInteraction,
        this._client
      );
      internalInteraction.responded = true;
      return data;
    }

    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_MISSING_HANDLER,
      `No handler for command ${interaction.data.name}`
    );
  }
  async handleModalSubmit(
    internalInteraction: InternalInteraction<APIModalSubmitInteraction>
  ): Promise<APIInteractionResponse> {
    const interaction = internalInteraction.interaction;
    const id = interaction.data.custom_id.split(":")[0];
    switch (id) {
      case "send":
        // Guild only
        if (!interaction.guild_id) {
          internalInteraction.responded = true;
          return onlyInGuildResponse;
        }
        const data = await handleModalSend(
          internalInteraction as InternalInteraction<APIModalSubmitGuildInteraction>,
          this._client
        );
        internalInteraction.responded = true;
        return data;
        break;

      default:
        break;
    }

    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.MODAL_CUSTOM_ID_NOT_FOUND,
      `No handler for modal with custom_id: ${interaction.data.custom_id}`
    );
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
      const internalInteraction = new InternalInteraction(request.body);
      try {
        const returnData = await handler.handleInteraction(internalInteraction);
        instance.metrics.interactionsReceived.inc({
          type: internalInteraction.interaction.type,
          status: InteractionOrRequestFinalStatus.SUCCESS,
        });
        return returnData;
      } catch (error) {
        if (error instanceof CustomError) {
          instance.metrics.interactionsReceived.inc({
            type: internalInteraction.interaction.type,
            status: error.status,
          });
          if (error instanceof UnexpectedFailure) {
            // Unexpected errors
            return {
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                content:
                  ":exclamation: Something went wrong! Please try again." +
                  `\nIf the problem persists, contact the bot developers.` +
                  `\nError message: ${error.message}` +
                  `\nError code: \`${error.status}\`` +
                  "\n*PS: This shouldn't happen*",
                flags: MessageFlags.Ephemeral,
              },
            };
          } else {
            // Expected errors
            return {
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                content: `:exclamation: ${error.message}`,
                flags: MessageFlags.Ephemeral,
              },
            };
          }
        }
        const message =
          !!error && !!(error as Error).message ? (error as Error).message : "";

        instance.metrics.interactionsReceived.inc({
          type: internalInteraction.interaction.type,
          status: InteractionOrRequestFinalStatus.GENERIC_UNEXPECTED_FAILURE,
        });
        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content:
              ":exclamation: Something went wrong! Please try again." +
              `\nIf the problem persists, contact the bot developers.` +
              `\nError message: ${message}` +
              `\nError code: \`${InteractionOrRequestFinalStatus.GENERIC_UNEXPECTED_FAILURE}\`` +
              "\n*PS: This shouldn't happen, and if it does, congratulations you've managed to find something unexpected*",
            flags: MessageFlags.Ephemeral,
          },
        };
      }
      //TODO Handle deferred responses
    }
  );
};

export default interactionsPlugin;
