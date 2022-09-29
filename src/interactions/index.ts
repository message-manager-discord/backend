// Entry point and handler for interactions
// This is where interactions are received and then are sent out to the correct functions and handlers

import Sentry from "@sentry/node";
import {
  APIApplicationCommandAutocompleteGuildInteraction,
  APIApplicationCommandAutocompleteInteraction,
  APIApplicationCommandAutocompleteResponse,
  APIChatInputApplicationCommandGuildInteraction,
  APIChatInputApplicationCommandInteraction,
  APIDMInteraction,
  APIGuildInteraction,
  APIInteraction,
  APIMessageApplicationCommandGuildInteraction,
  APIMessageApplicationCommandInteraction,
  APIMessageComponent,
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
import { ShardInactive } from "redis-discord-cache/dist/errors";
const { Forbidden } = httpErrors;
import axios from "axios";
import { verifyKey } from "discord-interactions";
import { FastifyRequest } from "fastify";

import { discordAPIBaseURL } from "../constants";
import {
  CustomError,
  ExpectedFailure,
  InteractionOrRequestFinalStatus,
  Outage,
  UnexpectedFailure,
} from "../errors";
import { GuildSession, NonGuildSession } from "../lib/session";
import handleCancelDeleteButton from "./buttons/cancel-delete";
import handleConfirmDeleteButton from "./buttons/confirm-delete";
import handleDeleteButton from "./buttons/delete";
import handleEditButton from "./buttons/edit";
import handleMessageGenerationButton from "./buttons/message-generation";
import handleReportButton from "./buttons/report";
import handleActionsCommand from "./commands/chatInput/actions";
import handleAddMessageCommand from "./commands/chatInput/add-message";
import handleConfigCommand from "./commands/chatInput/config";
import handleInfoCommand, {
  handleInfoAutocomplete,
} from "./commands/chatInput/info";
import handleRawFormatCommand from "./commands/chatInput/raw-format";
import handleSendCommand from "./commands/chatInput/send";
import handleActionMessageCommand from "./commands/message/actions";
import handleAddMessageMessageCommand from "./commands/message/addMessage";
import handleFetchMessageCommand from "./commands/message/fetch";
import {
  createInternalInteraction,
  InternalInteractionType,
} from "./interaction";
import handleModalEdit from "./modals/edit";
import handleModalMessageGeneration from "./modals/message-generation";
import handleModalReport from "./modals/report";
import handleModalSend from "./modals/send";
import handleManagePermissionsSelect from "./selects/manage-permissions-select";
import {
  InteractionReturnData,
  isFormDataReturnData,
  isInteractionReturnDataDeferred,
} from "./types";

// Interaction handler class
class InteractionHandler {
  private readonly _client: FastifyInstance;
  private readonly _publicKey: string;
  // _commands and _messageCommands are a way to register commands without building them into the handler
  // unfortunately it's not worth it for the other types of interactions
  private _commands: {
    [name: string]: {
      handler: (
        interaction: InternalInteractionType<
          | APIChatInputApplicationCommandInteraction
          | APIChatInputApplicationCommandGuildInteraction
        >,
        session: NonGuildSession | GuildSession,
        instance: FastifyInstance
      ) => Promise<InteractionReturnData>;
      guildOnly?: boolean;
      autocompleteHandler?: (
        interaction: InternalInteractionType<
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
        interaction: InternalInteractionType<
          | APIMessageApplicationCommandInteraction
          | APIMessageApplicationCommandGuildInteraction
        >,
        session: NonGuildSession | GuildSession,
        instance: FastifyInstance
      ) => Promise<InteractionReturnData>;
      guildOnly?: boolean;
    };
  } = {};
  constructor(client: FastifyInstance, publicKey: string) {
    this._client = client;
    this._publicKey = publicKey; // Public key is the public key from discord to verify interactions are valid
  }
  // Register a command
  addCommand(
    name: string,
    handler: (
      interaction: InternalInteractionType<APIChatInputApplicationCommandInteraction>,
      session: NonGuildSession | GuildSession,
      instance: FastifyInstance
    ) => Promise<InteractionReturnData>,
    autocompleteHandler?: (
      interaction: InternalInteractionType<APIApplicationCommandAutocompleteInteraction>,
      instance: FastifyInstance
    ) => Promise<APIApplicationCommandAutocompleteResponse>
  ) {
    this._commands[name] = {
      handler,
      autocompleteHandler,
    };
  }
  // Register a command that is only available in guilds (for type guarding it's different from above)
  addGuildOnlyCommand(
    name: string,
    handler: (
      interaction: InternalInteractionType<APIChatInputApplicationCommandGuildInteraction>,
      session: GuildSession,
      instance: FastifyInstance
    ) => Promise<InteractionReturnData>,
    autocompleteHandler?: (
      interaction: InternalInteractionType<APIApplicationCommandAutocompleteGuildInteraction>,
      instance: FastifyInstance
    ) => Promise<APIApplicationCommandAutocompleteResponse>
  ) {
    this._commands[name] = {
      handler: handler as (
        interaction: InternalInteractionType<APIChatInputApplicationCommandInteraction>,
        session: NonGuildSession | GuildSession,
        instance: FastifyInstance
      ) => Promise<InteractionReturnData>, // For some weird reason the types don't like to cross over
      autocompleteHandler: autocompleteHandler as (
        interaction: InternalInteractionType<APIApplicationCommandAutocompleteInteraction>,
        instance: FastifyInstance
      ) => Promise<APIApplicationCommandAutocompleteResponse>,
      guildOnly: true,
    };
  }
  // Register a message command
  addMessageCommand(
    name: string,
    handler: (
      interaction: InternalInteractionType<APIMessageApplicationCommandInteraction>,
      session: NonGuildSession | GuildSession,
      instance: FastifyInstance
    ) => Promise<InteractionReturnData>
  ) {
    this._messageCommands[name] = {
      handler,
    };
  }
  // Register a message command that is only available in guilds (for type guarding it's different from above)
  addGuildOnlyMessageCommand(
    name: string,
    handler: (
      interaction: InternalInteractionType<APIMessageApplicationCommandGuildInteraction>,
      session: GuildSession,
      instance: FastifyInstance
    ) => Promise<InteractionReturnData>
  ) {
    this._messageCommands[name] = {
      handler: handler as (
        interaction: InternalInteractionType<APIMessageApplicationCommandInteraction>,
        session: NonGuildSession | GuildSession,
        instance: FastifyInstance
      ) => Promise<InteractionReturnData>, // For some weird reason the types don't like to cross over
      guildOnly: true,
    };
  }

  // Verify the interaction is valid and signed correctly
  // to protect against attacks
  verify(request: FastifyRequest) {
    const signature = request.headers["x-signature-ed25519"];
    const timestamp = request.headers["x-signature-timestamp"];
    if (
      typeof signature !== "string" ||
      typeof timestamp !== "string" ||
      request.rawBody === undefined
    ) {
      return false;
    }
    return verifyKey(request.rawBody, signature, timestamp, this._publicKey);
  }

  // Handle an interaction - this is the main function that is called
  // Send it out to handlers for different types of interactions
  async handleInteraction(
    internalInteraction: InternalInteractionType<APIInteraction>
  ): Promise<InteractionReturnData> {
    const interaction = internalInteraction.interaction;
    // Send the interaction to the correct handler depending on type
    // Throw errors if the interaction type is unknown as discord may add new types
    switch (interaction.type) {
      case InteractionType.Ping:
        return { type: InteractionResponseType.Pong };
      case InteractionType.ApplicationCommand:
        if (interaction.data.type === ApplicationCommandType.ChatInput) {
          return await this.handleCommands(
            internalInteraction as InternalInteractionType<APIChatInputApplicationCommandInteraction>
          );
        } else if (interaction.data.type === ApplicationCommandType.Message) {
          return await this.handleMessageCommands(
            internalInteraction as InternalInteractionType<APIMessageApplicationCommandInteraction>
          );
        } else {
          throw new UnexpectedFailure(
            InteractionOrRequestFinalStatus.APPLICATION_COMMAND_TYPE_MISSING_HANDLER,
            `No handler for command type \`${interaction.data.type}\``
          );
        }
      case InteractionType.ModalSubmit:
        return await this.handleModalSubmit(
          internalInteraction as InternalInteractionType<APIModalSubmitInteraction>
        );
      case InteractionType.MessageComponent:
        return await this.handleComponent(
          internalInteraction as InternalInteractionType<APIMessageComponentInteraction>
        );
      case InteractionType.ApplicationCommandAutocomplete:
        return await this.handleAutocomplete(
          internalInteraction as InternalInteractionType<APIApplicationCommandAutocompleteInteraction>
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
  // Handle a message command interaction
  handleMessageCommands(
    internalInteraction: InternalInteractionType<APIMessageApplicationCommandInteraction>
  ): Promise<InteractionReturnData> {
    const interaction = internalInteraction.interaction;
    const name = interaction.data.name.toLowerCase();
    // Find if the message command is registered - if it is then send it to it's handler
    if (this._messageCommands[name] !== undefined) {
      this._client.metrics.commandsUsed.inc({
        command: name,
      });
      if (
        (this._messageCommands[name].guildOnly ?? false) &&
        interaction.guild_id === undefined
      ) {
        throw new ExpectedFailure(
          InteractionOrRequestFinalStatus.DM_INTERACTION_RECEIVED_WHEN_SHOULD_BE_GUILD_ONLY,
          ":exclamation: This command is only available in guilds"
        );
      }
      // create session to pass to handler
      let session: GuildSession | NonGuildSession;
      if (interaction.guild_id !== undefined) {
        session = this._client.sessionManager.createSessionFromInteraction(
          interaction as APIGuildInteraction
        );
      } else {
        session = this._client.sessionManager.createSessionFromInteraction(
          interaction as APIDMInteraction
        );
      }
      // Execute the handler
      const data = this._messageCommands[name].handler(
        internalInteraction,
        session,
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
  // Handle a chat input command interaction
  handleCommands(
    internalInteraction: InternalInteractionType<APIChatInputApplicationCommandInteraction>
  ): Promise<InteractionReturnData> {
    const interaction = internalInteraction.interaction;

    // Find if the command is registered - if it is then send it to it's handler
    if (this._commands[interaction.data.name] !== undefined) {
      this._client.metrics.commandsUsed.inc({ command: interaction.data.name });
      if (
        (this._commands[interaction.data.name].guildOnly ?? false) &&
        interaction.guild_id === undefined
      ) {
        throw new ExpectedFailure(
          InteractionOrRequestFinalStatus.DM_INTERACTION_RECEIVED_WHEN_SHOULD_BE_GUILD_ONLY,
          ":exclamation: This command is only available in guilds"
        );
      }
      // create session to pass to handler
      let session: GuildSession | NonGuildSession;
      if (interaction.guild_id !== undefined) {
        session = this._client.sessionManager.createSessionFromInteraction(
          interaction as APIGuildInteraction
        );
      } else {
        session = this._client.sessionManager.createSessionFromInteraction(
          interaction as APIDMInteraction
        );
      }
      const data = this._commands[interaction.data.name].handler(
        internalInteraction,
        session,
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
  // Handle autocomplete interactions
  async handleAutocomplete(
    internalInteraction: InternalInteractionType<APIApplicationCommandAutocompleteInteraction>
  ): Promise<APIApplicationCommandAutocompleteResponse> {
    const interaction = internalInteraction.interaction;
    // As autocomplete interactions are only on chat input commands, we can find the command by name

    const command = this._commands[interaction.data.name];

    if (command !== undefined && command.autocompleteHandler) {
      // If the command has an autocomplete handler
      if ((command.guildOnly ?? false) && interaction.guild_id === undefined) {
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
  // Handle modal submit interactions
  async handleModalSubmit(
    internalInteraction: InternalInteractionType<APIModalSubmitInteraction>
  ): Promise<InteractionReturnData> {
    const interaction = internalInteraction.interaction;
    // Convention (custom convention) is that the first part of the custom_id
    // when split by ":" is the idenfitier of the modal
    const id = interaction.data.custom_id.split(":")[0];
    switch (id) {
      case "send": // Modal for sending a message through the bot
        // Guild only
        if (interaction.guild_id === undefined) {
          internalInteraction.responded = true;
          throw new ExpectedFailure(
            InteractionOrRequestFinalStatus.DM_INTERACTION_RECEIVED_WHEN_SHOULD_BE_GUILD_ONLY,
            ":exclamation: This modal is only available in guilds"
          );
        }
        return await handleModalSend(
          internalInteraction as InternalInteractionType<APIModalSubmitGuildInteraction>,
          this._client.sessionManager.createSessionFromInteraction(
            interaction as APIGuildInteraction
          ),
          this._client
        );
      case "edit": // Modal for editing a message through the bot
        // Guild only
        if (interaction.guild_id === undefined) {
          internalInteraction.responded = true;
          throw new ExpectedFailure(
            InteractionOrRequestFinalStatus.DM_INTERACTION_RECEIVED_WHEN_SHOULD_BE_GUILD_ONLY,
            ":exclamation: This modal is only available in guilds"
          );
        }
        return await handleModalEdit(
          internalInteraction as InternalInteractionType<APIModalSubmitGuildInteraction>,
          this._client.sessionManager.createSessionFromInteraction(
            interaction as APIGuildInteraction
          ),
          this._client
        );
      case "report": // Modal for reporting a message through the bot
        // Guild only
        if (interaction.guild_id === undefined) {
          internalInteraction.responded = true;
          throw new ExpectedFailure(
            InteractionOrRequestFinalStatus.DM_INTERACTION_RECEIVED_WHEN_SHOULD_BE_GUILD_ONLY,
            ":exclamation: This modal is only available in guilds"
          );
        }
        return await handleModalReport(
          internalInteraction as InternalInteractionType<APIModalSubmitGuildInteraction>,
          this._client.sessionManager.createSessionFromInteraction(
            interaction as APIGuildInteraction
          ),
          this._client
        );
      case "message-generation": // Modal for message generation
        // Guild only
        if (interaction.guild_id === undefined) {
          internalInteraction.responded = true;
          throw new ExpectedFailure(
            InteractionOrRequestFinalStatus.DM_INTERACTION_RECEIVED_WHEN_SHOULD_BE_GUILD_ONLY,
            ":exclamation: This modal is only available in guilds"
          );
        }
        return await handleModalMessageGeneration(
          internalInteraction as InternalInteractionType<APIModalSubmitGuildInteraction>,
          this._client.sessionManager.createSessionFromInteraction(
            interaction as APIGuildInteraction
          ),
          this._client
        );
      default:
        break;
    }

    // Throw if not handled
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.MODAL_CUSTOM_ID_NOT_FOUND,
      `No handler for modal with custom_id: \`${interaction.data.custom_id}\``
    );
  }
  // Handle a message component interaction
  async handleComponent(
    internalInteraction: InternalInteractionType<APIMessageComponentInteraction>
  ): Promise<InteractionReturnData> {
    const interaction = internalInteraction.interaction;
    const name = interaction.data.custom_id.split(":")[0];
    switch (
      name // Components by name
    ) {
      case "edit": // Button to start the edit process
        // Guild only
        if (interaction.guild_id === undefined) {
          internalInteraction.responded = true;
          throw new UnexpectedFailure(
            InteractionOrRequestFinalStatus.GUILD_COMPONENT_IN_DM_INTERACTION,
            ":exclamation: This button is only available in guilds"
          );
        }
        return await handleEditButton(
          internalInteraction as InternalInteractionType<APIMessageComponentGuildInteraction>,
          this._client.sessionManager.createSessionFromInteraction(
            interaction as APIGuildInteraction
          ),
          this._client
        );
      case "delete": // Button to start the delete process
        // Guild only
        if (interaction.guild_id === undefined) {
          internalInteraction.responded = true;
          throw new UnexpectedFailure(
            InteractionOrRequestFinalStatus.GUILD_COMPONENT_IN_DM_INTERACTION,
            ":exclamation: This button is only available in guilds"
          );
        }
        return await handleDeleteButton(
          internalInteraction as InternalInteractionType<APIMessageComponentGuildInteraction>,
          this._client.sessionManager.createSessionFromInteraction(
            interaction as APIGuildInteraction
          ),
          this._client
        );

      case "confirm-delete": // Button to confirm the delete process
        // Guild only
        if (interaction.guild_id === undefined) {
          internalInteraction.responded = true;
          throw new UnexpectedFailure(
            InteractionOrRequestFinalStatus.GUILD_COMPONENT_IN_DM_INTERACTION,
            ":exclamation: This button is only available in guilds"
          );
        }
        return await handleConfirmDeleteButton(
          internalInteraction as InternalInteractionType<APIMessageComponentGuildInteraction>,
          this._client.sessionManager.createSessionFromInteraction(
            interaction as APIGuildInteraction
          ),
          this._client
        );

      case "cancel-delete": // Button to cancel the delete process
        // Guild only
        if (interaction.guild_id === undefined) {
          internalInteraction.responded = true;
          throw new UnexpectedFailure(
            InteractionOrRequestFinalStatus.GUILD_COMPONENT_IN_DM_INTERACTION,
            ":exclamation: This button is only available in guilds"
          );
        }
        return await handleCancelDeleteButton(
          internalInteraction as InternalInteractionType<APIMessageComponentGuildInteraction>,
          this._client.sessionManager.createSessionFromInteraction(
            interaction as APIGuildInteraction
          ),
          this._client
        );

      case "report": // Button to start the report process
        // Guild only
        if (interaction.guild_id === undefined) {
          internalInteraction.responded = true;
          throw new UnexpectedFailure(
            InteractionOrRequestFinalStatus.GUILD_COMPONENT_IN_DM_INTERACTION,
            ":exclamation: This button is only available in guilds"
          );
        }
        return await handleReportButton(
          internalInteraction as InternalInteractionType<APIMessageComponentGuildInteraction>,
          this._client.sessionManager.createSessionFromInteraction(
            interaction as APIGuildInteraction
          ),
          this._client
        );

      case "manage-permissions-select": // Select menu to manage permissions
        // Guild only
        if (interaction.guild_id === undefined) {
          internalInteraction.responded = true;
          throw new UnexpectedFailure(
            InteractionOrRequestFinalStatus.GUILD_COMPONENT_IN_DM_INTERACTION,
            ":exclamation: This select menu is only available in guilds"
          );
        }
        return await handleManagePermissionsSelect(
          internalInteraction as InternalInteractionType<APIMessageComponentGuildInteraction>,
          this._client.sessionManager.createSessionFromInteraction(
            interaction as APIGuildInteraction
          ),
          this._client
        );

      case "message-generation": // Buttons around the message generation process
        // Guild only
        if (interaction.guild_id === undefined) {
          internalInteraction.responded = true;
          throw new UnexpectedFailure(
            InteractionOrRequestFinalStatus.GUILD_COMPONENT_IN_DM_INTERACTION,
            ":exclamation: This button is only available in guilds"
          );
        }
        return await handleMessageGenerationButton(
          internalInteraction as InternalInteractionType<APIMessageComponentGuildInteraction>,
          this._client.sessionManager.createSessionFromInteraction(
            interaction as APIGuildInteraction
          ),
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

// Interactions plugin - the route to which interactions are sent to
const interactionsPlugin = async (instance: FastifyInstance) => {
  // Create interaction handler
  const handler = new InteractionHandler(
    instance,
    instance.envVars.DISCORD_INTERACTIONS_PUBLIC_KEY
  );

  // Add commands to handler
  handler.addCommand("info", handleInfoCommand, handleInfoAutocomplete);
  handler.addGuildOnlyCommand("send", handleSendCommand);
  handler.addGuildOnlyCommand("config", handleConfigCommand);
  handler.addGuildOnlyCommand("actions", handleActionsCommand);
  handler.addGuildOnlyCommand("add-message", handleAddMessageCommand);
  handler.addGuildOnlyCommand("raw-format", handleRawFormatCommand);

  // Add message commands to handler
  handler.addGuildOnlyMessageCommand("actions", handleActionMessageCommand);
  handler.addGuildOnlyMessageCommand("fetch", handleFetchMessageCommand);
  handler.addGuildOnlyMessageCommand(
    "add message",
    handleAddMessageMessageCommand
  );

  // Register raw body plugin - this is required for interaction verification (as the rawbody is used for signing)
  await instance.register(FastifyRawBody, {
    field: "rawBody", // change the default request.rawBody property name
    global: false, // add the rawBody to every request. **Default true**
    encoding: false, // set it to false to set rawBody as a Buffer **Default utf8**
    runFirst: true, // get the body before any preParsing hook change/uncompress it. **Default false**
    routes: [], // array of routes, **`global`** will be ignored, wildcard routes not supported
  });

  // Register the interaction route
  instance.post<{ Body: APIInteraction }>(
    `/interactions`,
    {
      // Enable rawBody plugin
      config: {
        rawBody: true,
      },
      // Verify the interaction first
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      preHandler: async (request, reply) => {
        if (!handler.verify(request)) {
          return reply.send(new Forbidden("Invalid signature"));
        }
      },
    },

    async (request, reply) => {
      // Create interaction interaction representation from request
      const internalInteraction = createInternalInteraction<APIInteraction>(
        request.body
      );

      try {
        // Try to execute the interaction handler
        const returnData = await handler.handleInteraction(internalInteraction);
        if (isInteractionReturnDataDeferred(returnData)) {
          // This handles deferred interactions. The idea is that anything that does database calls or heavy stuff should be deferred.
          await reply.send(returnData.returnData);
          internalInteraction.deferred = true;
          // Set after response is sent so that if the sending fails it doesn't get set to true
          const afterDeferData = await returnData.callback(); // Execute the defer callback
          if (isFormDataReturnData(afterDeferData)) {
            // If it's form data need to send headers and body
            // Patch interaction response (this is how defers are responded to)
            await axios.request({
              method: "PATCH",
              url: `${discordAPIBaseURL}/webhooks/${instance.envVars.DISCORD_CLIENT_ID}/${internalInteraction.interaction.token}/messages/@original`,
              data: afterDeferData.body,
              headers: afterDeferData.headers,
            });
          } else {
            // Patch interaction response (this is how defers are responded to)
            await axios.request({
              method: "PATCH",
              url: `${discordAPIBaseURL}/webhooks/${instance.envVars.DISCORD_CLIENT_ID}/${internalInteraction.interaction.token}/messages/@original`,
              data: afterDeferData,
            });
          }
          // Increment the deferred interactions counter
          instance.metrics.interactionsReceived.inc({
            type: internalInteraction.interaction.type,
            status: InteractionOrRequestFinalStatus.SUCCESS,
            deferred: true.toString(),
          });
        } else {
          // Increment the interactions counter
          instance.metrics.interactionsReceived.inc({
            type: internalInteraction.interaction.type,
            status: InteractionOrRequestFinalStatus.SUCCESS,
          });
          // Not deferred
          if (isFormDataReturnData(returnData)) {
            return reply.headers(returnData.headers).send(returnData.body);
          } else {
            return returnData;
          }
        }
      } catch (error) {
        // To generate the response with errorMessage and components
        // So that different types of errors can be handled differently
        let errorMessage: string;
        let components: APIMessageComponent[] = [];
        if (error instanceof CustomError) {
          // Custom errors
          // Increment the interactions counter with the error status code
          instance.metrics.interactionsReceived.inc({
            type: internalInteraction.interaction.type,
            status: error.status,
            deferred: internalInteraction.deferred.toString(),
          });
          if (error instanceof UnexpectedFailure) {
            // Unexpected errors
            errorMessage =
              ":exclamation: Something went wrong! Please try again." +
              `\nIf the problem persists, contact the bot developers.` +
              `\nError message: ${error.message}` +
              `\nError code: \`${error.status}\`` +
              "\n*PS: This shouldn't happen*";
            components = error.components;
            // As this error is unexpected log it to sentry and the logger
            Sentry.captureException(error);
            instance.log.error(error);
          } else if (error instanceof Outage) {
            // Outage errors - also logged to sentry and the logger
            errorMessage =
              `:exclamation: There is currently an outage! Please check https://status--message.anothercat.me for updates - or join the support server` +
              `\nOutage error: ${error.message}` +
              `\nOutage error code: \`${error.status}\``;
            components = error.components;
            Sentry.captureException(error);
            instance.log.error(error);
          } else {
            // Expected errors - not sent to sentry or logged
            errorMessage = `:exclamation: ${error.message}`;
            components = error.components;
          }
        } else if (error instanceof ShardInactive) {
          // Also a type of outage - but from the gateway library - so not from a custom error
          errorMessage =
            `:exclamation: There is currently an outage! Please check <https://status--message.anothercat.me> for updates - or join the support server` +
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            `\nOutage error: ${error.message}` +
            `\nOutage error code: \`${InteractionOrRequestFinalStatus.GATEWAY_CACHE_SHARD_OUTAGE}\``;
          instance.metrics.interactionsReceived.inc({
            type: internalInteraction.interaction.type,
            status: InteractionOrRequestFinalStatus.GATEWAY_CACHE_SHARD_OUTAGE,
            deferred: internalInteraction.deferred.toString(),
          });
          // Also log to sentry and the logger
          Sentry.captureException(error);
          instance.log.error(error);
        } else {
          // Unhandled error, usually indicates a bug
          // Try and generate an error message
          const message =
            (error as Error | undefined) !== undefined &&
            !!(error as Error).message
              ? (error as Error).message
              : "";
          // Increment counter as it hasn't been yet
          instance.metrics.interactionsReceived.inc({
            type: internalInteraction.interaction.type,
            status: InteractionOrRequestFinalStatus.GENERIC_UNEXPECTED_FAILURE,
          });
          // Log to sentry and the logger
          Sentry.captureException(error);
          instance.log.error(error);
          errorMessage =
            ":exclamation: Something went wrong! Please try again." +
            `\nIf the problem persists, contact the bot developers.` +
            `\nError message: ${message}` +
            `\nError code: \`${InteractionOrRequestFinalStatus.GENERIC_UNEXPECTED_FAILURE}\`` +
            "\n*PS: This shouldn't happen, and if it does, congratulations you've managed to find something unexpected*";
        }
        if (!internalInteraction.deferred) {
          // If not deferred need to just send a response
          if (internalInteraction.interaction.message !== undefined) {
            const message = internalInteraction.interaction.message;
            // If there's a message - update the message components with the original components
            // This is to prevent the changing of default values in selects when an error occurs
            void (async () => {
              // wait 1/4 of a second so that the interaction has been "responded" to before the follow up is sent
              await new Promise((resolve) => setTimeout(resolve, 250));
              await axios.request({
                method: "POST",
                url: `${discordAPIBaseURL}/webhooks/${instance.envVars.DISCORD_CLIENT_ID}/${internalInteraction.interaction.token}`,
                data: {
                  content: errorMessage,
                  components,
                  flags: MessageFlags.Ephemeral,
                },
              });
            })();

            return {
              type: InteractionResponseType.UpdateMessage,
              data: {
                content: message.content,
                embeds: message.embeds,
                components: message.components,
              },
            };
          }
          // If there's no message - just send the error message as a response
          return {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: errorMessage,
              flags: MessageFlags.Ephemeral,
              components: components,
            },
          };
        } else {
          // If deferred - edit the original message
          await axios.request({
            method: "PATCH",
            url: `${discordAPIBaseURL}/webhooks/${instance.envVars.DISCORD_CLIENT_ID}/${internalInteraction.interaction.token}/messages/@original`,
            data: { content: errorMessage, components },
          });
        }
      }
    }
  );
};

export default interactionsPlugin;
