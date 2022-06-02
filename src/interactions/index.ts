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
const { Forbidden } = httpErrors;
import axios from "axios";
import { verifyKey } from "discord-interactions";
import { FastifyRequest } from "fastify";

import { discordAPIBaseURL } from "../constants";
import {
  CustomError,
  ExpectedFailure,
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../errors";
import { GuildSession, NonGuildSession } from "../lib/session";
import handleCancelDeleteButton from "./buttons/cancel-delete";
import handleConfirmDeleteButton from "./buttons/confirm-delete";
import handleDeleteButton from "./buttons/delete";
import handleEditButton from "./buttons/edit";
import handleReportButton from "./buttons/report";
import handleConfigCommand from "./commands/chatInput/config";
import handleInfoCommand, {
  handleInfoAutocomplete,
} from "./commands/chatInput/info";
import handleSendCommand from "./commands/chatInput/send";
import handleActionMessageCommand from "./commands/message/actions";
import handleAddMessageCommand from "./commands/message/addMessage";
import handleFetchMessageCommand from "./commands/message/fetch";
import {
  createInternalInteraction,
  InternalInteractionType,
} from "./interaction";
import handleModalEdit from "./modals/edit";
import handleModalReport from "./modals/report";
import handleModalSend from "./modals/send";
import handleManagePermissionsSelect from "./selects/manage-permissions-select";
import {
  InteractionReturnData,
  isFormDataReturnData,
  isInteractionReturnDataDeferred,
} from "./types";

class InteractionHandler {
  private readonly _client: FastifyInstance;
  private readonly _publicKey: string;
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
    this._publicKey = publicKey;
  }
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

  async handleInteraction(
    internalInteraction: InternalInteractionType<APIInteraction>
  ): Promise<InteractionReturnData> {
    const interaction = internalInteraction.interaction;
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
  handleMessageCommands(
    internalInteraction: InternalInteractionType<APIMessageApplicationCommandInteraction>
  ): Promise<InteractionReturnData> {
    const interaction = internalInteraction.interaction;
    const name = interaction.data.name.toLowerCase();
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
  handleCommands(
    internalInteraction: InternalInteractionType<APIChatInputApplicationCommandInteraction>
  ): Promise<InteractionReturnData> {
    const interaction = internalInteraction.interaction;

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
  async handleAutocomplete(
    internalInteraction: InternalInteractionType<APIApplicationCommandAutocompleteInteraction>
  ): Promise<APIApplicationCommandAutocompleteResponse> {
    const interaction = internalInteraction.interaction;
    const command = this._commands[interaction.data.name];

    if (command !== undefined && command.autocompleteHandler) {
      // todo: metrics
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
  async handleModalSubmit(
    internalInteraction: InternalInteractionType<APIModalSubmitInteraction>
  ): Promise<InteractionReturnData> {
    const interaction = internalInteraction.interaction;
    const id = interaction.data.custom_id.split(":")[0];
    switch (id) {
      case "send":
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
      case "edit":
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
      case "report":
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

      default:
        break;
    }

    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.MODAL_CUSTOM_ID_NOT_FOUND,
      `No handler for modal with custom_id: \`${interaction.data.custom_id}\``
    );
  }
  async handleComponent(
    internalInteraction: InternalInteractionType<APIMessageComponentInteraction>
  ): Promise<InteractionReturnData> {
    const interaction = internalInteraction.interaction;
    const name = interaction.data.custom_id.split(":")[0];
    switch (name) {
      case "edit":
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
      case "delete":
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

      case "confirm-delete":
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

      case "cancel-delete":
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

      case "report":
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

      case "manage-permissions-select":
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
      const internalInteraction = createInternalInteraction<APIInteraction>(
        request.body
      );

      try {
        const returnData = await handler.handleInteraction(internalInteraction);
        if (isInteractionReturnDataDeferred(returnData)) {
          // This handles deferred interactions. The idea is that anything that does database calls or heavy stuff should be deferred.
          await reply.send(returnData.returnData);
          internalInteraction.deferred = true;
          const afterDeferData = await returnData.callback();
          if (isFormDataReturnData(afterDeferData)) {
            await axios.request({
              method: "PATCH",
              url: `${discordAPIBaseURL}/webhooks/${instance.envVars.DISCORD_CLIENT_ID}/${internalInteraction.interaction.token}/messages/@original`,
              data: afterDeferData.body,
              headers: afterDeferData.headers,
            });
          } else {
            await axios.request({
              method: "PATCH",
              url: `${discordAPIBaseURL}/webhooks/${instance.envVars.DISCORD_CLIENT_ID}/${internalInteraction.interaction.token}/messages/@original`,
              data: afterDeferData,
            });
          }
          instance.metrics.interactionsReceived.inc({
            type: internalInteraction.interaction.type,
            status: InteractionOrRequestFinalStatus.SUCCESS,
            deferred: true.toString(),
          });
        } else {
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
        let errorMessage: string;
        let components: APIMessageComponent[] = [];
        if (error instanceof CustomError) {
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
          } else {
            // Expected errors
            errorMessage = `:exclamation: ${error.message}`;
            components = error.components;
          }
        } else {
          const message =
            (error as Error | undefined) !== undefined &&
            !!(error as Error).message
              ? (error as Error).message
              : "";

          instance.metrics.interactionsReceived.inc({
            type: internalInteraction.interaction.type,
            status: InteractionOrRequestFinalStatus.GENERIC_UNEXPECTED_FAILURE,
          });
          instance.log.error(error);
          errorMessage =
            ":exclamation: Something went wrong! Please try again." +
            `\nIf the problem persists, contact the bot developers.` +
            `\nError message: ${message}` +
            `\nError code: \`${InteractionOrRequestFinalStatus.GENERIC_UNEXPECTED_FAILURE}\`` +
            "\n*PS: This shouldn't happen, and if it does, congratulations you've managed to find something unexpected*";
        }
        if (!internalInteraction.deferred) {
          if (internalInteraction.interaction.message !== undefined) {
            const message = internalInteraction.interaction.message;
            // Update message components with the original components
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
          return {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: errorMessage,
              flags: MessageFlags.Ephemeral,
              components: components,
            },
          };
        } else {
          await axios.request({
            method: "PATCH",
            url: `${discordAPIBaseURL}/webhooks/${instance.envVars.DISCORD_CLIENT_ID}/${internalInteraction.interaction.token}/messages/@original`,
            data: { content: errorMessage, components },
          });
        }
      }
      //TODO Handle deferred responses
    }
  );
};

export default interactionsPlugin;
