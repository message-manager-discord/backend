import {
  APIApplicationCommandAutocompleteGuildInteraction,
  APIApplicationCommandAutocompleteInteraction,
  APIApplicationCommandAutocompleteResponse,
  APIChatInputApplicationCommandGuildInteraction,
  APIChatInputApplicationCommandInteraction,
  APIInteraction,
  APIInteractionResponse,
  APIMessageApplicationCommandGuildInteraction,
  APIMessageApplicationCommandInteraction,
  APIMessageComponentGuildInteraction,
  APIMessageComponentInteraction,
  APIModalSubmitGuildInteraction,
  APIModalSubmitInteraction,
  ApplicationCommandType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import FastifyRawBody from "fastify-raw-body";
import httpErrors from "http-errors";
const { Forbidden } = httpErrors;
import { FastifyRequest } from "fastify";
import { verifyKey } from "discord-interactions";
import handleInfoCommand, {
  handleInfoAutocomplete,
} from "./commands/chatInput/info";
import handleSendCommand from "./commands/chatInput/send";
import handleConfigCommand from "./commands/chatInput/config";
import handleModalSend from "./modals/send";
import { InternalInteraction } from "./interaction";
import {
  CustomError,
  ExpectedFailure,
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../errors";
import handleActionMessageCommand from "./commands/message/actions";
import handleReportButton from "./buttons/report";
import handleFetchMessageCommand from "./commands/message/fetch";
import { FormDataReturnData, isFormDataReturnData } from "./types";
import handleEditButton from "./buttons/edit";
import handleDeleteButton from "./buttons/delete";
import handleModalEdit from "./modals/edit";
import handleConfirmDeleteButton from "./buttons/confirm-delete";
import handleCancelDeleteButton from "./buttons/cancel-delete";
import handleModalReport from "./modals/report";
import handleAddMessageCommand from "./commands/message/addMessage";

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
      autocompleteHandler?: (
        interaction: InternalInteraction<
          | APIApplicationCommandAutocompleteInteraction
          | APIApplicationCommandAutocompleteGuildInteraction
        >,
        instance: FastifyInstance
      ) => Promise<APIApplicationCommandAutocompleteResponse>;
    };
  } = {};
  private _messageCommands: {
    [name: string]: {
      handler: (
        interaction: InternalInteraction<
          | APIMessageApplicationCommandInteraction
          | APIMessageApplicationCommandGuildInteraction
        >,
        instance: FastifyInstance
      ) => Promise<APIInteractionResponse | FormDataReturnData>;
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
    ) => Promise<APIInteractionResponse>,
    autocompleteHandler?: (
      interaction: InternalInteraction<APIApplicationCommandAutocompleteInteraction>,
      instance: FastifyInstance
    ) => Promise<APIApplicationCommandAutocompleteResponse>
  ) {
    this._commands[name] = {
      handler,
      autocompleteHandler,
    };
  }
  addGuildOnlyCommand(
    name: string,
    handler: (
      interaction: InternalInteraction<APIChatInputApplicationCommandGuildInteraction>,
      instance: FastifyInstance
    ) => Promise<APIInteractionResponse>,
    autocompleteHandler?: (
      interaction: InternalInteraction<APIApplicationCommandAutocompleteGuildInteraction>,
      instance: FastifyInstance
    ) => Promise<APIApplicationCommandAutocompleteResponse>
  ) {
    this._commands[name] = {
      handler: handler as (
        interaction: InternalInteraction<APIChatInputApplicationCommandInteraction>,
        instance: FastifyInstance
      ) => Promise<APIInteractionResponse>, // For some weird reason the types don't like to cross over
      autocompleteHandler: autocompleteHandler as (
        interaction: InternalInteraction<APIApplicationCommandAutocompleteInteraction>,
        instance: FastifyInstance
      ) => Promise<APIApplicationCommandAutocompleteResponse>,
      guildOnly: true,
    };
  }
  addMessageCommand(
    name: string,
    handler: (
      interaction: InternalInteraction<APIMessageApplicationCommandInteraction>,
      instance: FastifyInstance
    ) => Promise<APIInteractionResponse | FormDataReturnData>
  ) {
    this._messageCommands[name] = {
      handler,
    };
  }
  addGuildOnlyMessageCommand(
    name: string,
    handler: (
      interaction: InternalInteraction<APIMessageApplicationCommandGuildInteraction>,
      instance: FastifyInstance
    ) => Promise<APIInteractionResponse | FormDataReturnData>
  ) {
    this._messageCommands[name] = {
      handler: handler as (
        interaction: InternalInteraction<APIMessageApplicationCommandInteraction>,
        instance: FastifyInstance
      ) => Promise<APIInteractionResponse>, // For some weird reason the types don't like to cross over
      guildOnly: true,
    };
  }

  verify(request: FastifyRequest) {
    const signature = request.headers["x-signature-ed25519"];
    const timestamp = request.headers["x-signature-timestamp"];
    if (
      typeof signature !== "string" ||
      typeof timestamp !== "string" ||
      !request.rawBody
    ) {
      return false;
    }
    return verifyKey(request.rawBody, signature, timestamp, this._publicKey);
  }

  async handleInteraction(
    internalInteraction: InternalInteraction<APIInteraction>
  ): Promise<APIInteractionResponse | FormDataReturnData> {
    const interaction = internalInteraction.interaction;
    switch (interaction.type) {
      case InteractionType.Ping:
        return { type: InteractionResponseType.Pong };
      case InteractionType.ApplicationCommand:
        if (interaction.data.type === ApplicationCommandType.ChatInput) {
          return await this.handleCommands(
            internalInteraction as InternalInteraction<APIChatInputApplicationCommandInteraction>
          );
        } else if (interaction.data.type === ApplicationCommandType.Message) {
          return await this.handleMessageCommands(
            internalInteraction as InternalInteraction<APIMessageApplicationCommandInteraction>
          );
        } else {
          throw new UnexpectedFailure(
            InteractionOrRequestFinalStatus.APPLICATION_COMMAND_TYPE_MISSING_HANDLER,
            `No handler for command type \`${interaction.data.type}\``
          );
        }
      case InteractionType.ModalSubmit:
        return await this.handleModalSubmit(
          internalInteraction as InternalInteraction<APIModalSubmitInteraction>
        );
      case InteractionType.MessageComponent:
        return await this.handleComponent(
          internalInteraction as InternalInteraction<APIMessageComponentInteraction>
        );
      case InteractionType.ApplicationCommandAutocomplete:
        return await this.handleAutocomplete(
          internalInteraction as InternalInteraction<APIApplicationCommandAutocompleteInteraction>
        );
      default:
        throw new UnexpectedFailure(
          InteractionOrRequestFinalStatus.INTERACTION_TYPE_MISSING_HANDLER,

          // eslint doesn't like this because it thinks that there are no other types. However the types are subject to change from discord's api
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
          `No handler for interaction type \`${(interaction as any).type}\``
        );
    }
  }
  async handleMessageCommands(
    internalInteraction: InternalInteraction<APIMessageApplicationCommandInteraction>
  ): Promise<APIInteractionResponse | FormDataReturnData> {
    const interaction = internalInteraction.interaction;
    const name = interaction.data.name.toLowerCase();
    if (this._messageCommands[name]) {
      this._client.metrics.commandsUsed.inc({
        command: name,
      });
      if (this._messageCommands[name].guildOnly && !interaction.guild_id) {
        throw new ExpectedFailure(
          InteractionOrRequestFinalStatus.DM_INTERACTION_RECEIVED_WHEN_SHOULD_BE_GUILD_ONLY,
          ":exclamation: This command is only available in guilds"
        );
      }
      const data = this._messageCommands[name].handler(
        internalInteraction,
        this._client
      );
      internalInteraction.responded = true;
      return data;
    }

    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_MISSING_HANDLER,
      `No handler for command \`${interaction.data.name}\``
    );
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
        throw new ExpectedFailure(
          InteractionOrRequestFinalStatus.DM_INTERACTION_RECEIVED_WHEN_SHOULD_BE_GUILD_ONLY,
          ":exclamation: This command is only available in guilds"
        );
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
      `No handler for command \`${interaction.data.name}\``
    );
  }
  async handleAutocomplete(
    internalInteraction: InternalInteraction<APIApplicationCommandAutocompleteInteraction>
  ): Promise<APIInteractionResponse> {
    const interaction = internalInteraction.interaction;
    const command = this._commands[interaction.data.name];

    if (command && command.autocompleteHandler) {
      // todo: metrics
      if (command.guildOnly && !interaction.guild_id) {
        throw new ExpectedFailure(
          InteractionOrRequestFinalStatus.DM_INTERACTION_RECEIVED_WHEN_SHOULD_BE_GUILD_ONLY,
          ":exclamation: This autocomplete command is only available in guilds"
        );
      }
      const data = command.autocompleteHandler(
        internalInteraction,
        this._client
      );
      internalInteraction.responded = true;
      return data;
    }

    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_MISSING_HANDLER,
      `No handler for command \`${interaction.data.name}\``
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
          throw new ExpectedFailure(
            InteractionOrRequestFinalStatus.DM_INTERACTION_RECEIVED_WHEN_SHOULD_BE_GUILD_ONLY,
            ":exclamation: This modal is only available in guilds"
          );
        }
        return await handleModalSend(
          internalInteraction as InternalInteraction<APIModalSubmitGuildInteraction>,
          this._client
        );
      case "edit":
        // Guild only
        if (!interaction.guild_id) {
          internalInteraction.responded = true;
          throw new ExpectedFailure(
            InteractionOrRequestFinalStatus.DM_INTERACTION_RECEIVED_WHEN_SHOULD_BE_GUILD_ONLY,
            ":exclamation: This modal is only available in guilds"
          );
        }
        return await handleModalEdit(
          internalInteraction as InternalInteraction<APIModalSubmitGuildInteraction>,
          this._client
        );
      case "report":
        // Guild only
        if (!interaction.guild_id) {
          internalInteraction.responded = true;
          throw new ExpectedFailure(
            InteractionOrRequestFinalStatus.DM_INTERACTION_RECEIVED_WHEN_SHOULD_BE_GUILD_ONLY,
            ":exclamation: This modal is only available in guilds"
          );
        }
        return await handleModalReport(
          internalInteraction as InternalInteraction<APIModalSubmitGuildInteraction>,
          this._client
        );

      default:
        break;
    }

    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.MODAL_CUSTOM_ID_NOT_FOUND,
      `No handler for modal with custom_id: \`${interaction.data.custom_id}\``
    );
  }
  async handleComponent(
    internalInteraction: InternalInteraction<APIMessageComponentInteraction>
  ): Promise<APIInteractionResponse> {
    const interaction = internalInteraction.interaction;
    const name = interaction.data.custom_id.split(":")[0];
    switch (name) {
      case "edit":
        // Guild only
        if (!interaction.guild_id) {
          internalInteraction.responded = true;
          throw new UnexpectedFailure(
            InteractionOrRequestFinalStatus.GUILD_COMPONENT_IN_DM_INTERACTION,
            ":exclamation: This button is only available in guilds"
          );
        }
        return await handleEditButton(
          internalInteraction as InternalInteraction<APIMessageComponentGuildInteraction>,
          this._client
        );
      case "delete":
        // Guild only
        if (!interaction.guild_id) {
          internalInteraction.responded = true;
          throw new UnexpectedFailure(
            InteractionOrRequestFinalStatus.GUILD_COMPONENT_IN_DM_INTERACTION,
            ":exclamation: This button is only available in guilds"
          );
        }
        return await handleDeleteButton(
          internalInteraction as InternalInteraction<APIMessageComponentGuildInteraction>,
          this._client
        );

      case "confirm-delete":
        // Guild only
        if (!interaction.guild_id) {
          internalInteraction.responded = true;
          throw new UnexpectedFailure(
            InteractionOrRequestFinalStatus.GUILD_COMPONENT_IN_DM_INTERACTION,
            ":exclamation: This button is only available in guilds"
          );
        }
        return await handleConfirmDeleteButton(
          internalInteraction as InternalInteraction<APIMessageComponentGuildInteraction>,
          this._client
        );

      case "cancel-delete":
        // Guild only
        if (!interaction.guild_id) {
          internalInteraction.responded = true;
          throw new UnexpectedFailure(
            InteractionOrRequestFinalStatus.GUILD_COMPONENT_IN_DM_INTERACTION,
            ":exclamation: This button is only available in guilds"
          );
        }
        return await handleCancelDeleteButton(
          internalInteraction as InternalInteraction<APIMessageComponentGuildInteraction>,
          this._client
        );

      case "report":
        // Guild only
        if (!interaction.guild_id) {
          internalInteraction.responded = true;
          throw new UnexpectedFailure(
            InteractionOrRequestFinalStatus.GUILD_COMPONENT_IN_DM_INTERACTION,
            ":exclamation: This button is only available in guilds"
          );
        }
        return await handleReportButton(
          internalInteraction as InternalInteraction<APIMessageComponentGuildInteraction>,
          this._client
        );

      default:
        break;
    }

    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.COMPONENT_CUSTOM_ID_NOT_FOUND,
      `No handler for modal with custom_id: \`${interaction.data.custom_id}\``
    );
  }
}

const interactionsPlugin = async (instance: FastifyInstance) => {
  const handler = new InteractionHandler(
    instance,
    instance.envVars.DISCORD_INTERACTIONS_PUBLIC_KEY
  );

  // Add commands to handler
  handler.addCommand("info", handleInfoCommand, handleInfoAutocomplete);
  handler.addGuildOnlyCommand("send", handleSendCommand);
  handler.addGuildOnlyCommand("config", handleConfigCommand);

  // Add message commands to handler
  handler.addGuildOnlyMessageCommand("actions", handleActionMessageCommand);
  handler.addGuildOnlyMessageCommand("fetch", handleFetchMessageCommand);
  handler.addGuildOnlyMessageCommand("add message", handleAddMessageCommand);

  await instance.register(FastifyRawBody, {
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
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      preHandler: async (request, reply) => {
        if (!handler.verify(request)) {
          return reply.send(new Forbidden("Invalid signature"));
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
        if (isFormDataReturnData(returnData)) {
          return reply.headers(returnData.headers).send(returnData.body);
        } else {
          return returnData;
        }
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
                components: error.components,
              },
            };
          } else {
            // Expected errors
            return {
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                content: `:exclamation: ${error.message}`,
                flags: MessageFlags.Ephemeral,
                components: error.components,
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
        instance.log.error(error);
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
