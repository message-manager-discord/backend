/**
 * Handles creating and deleting webhooks and the relevant database cache
 * As webhooks may be deleted by other means (not by the bot) and this must be handled
 * For example if a deleted webhook is detected (404), it will be deleted from the database, and an attempt to recreate it will be made
 */

import { DiscordAPIError, RawFile } from "@discordjs/rest";
import { Snowflake } from "discord-api-types/globals";
import {
  APIMessage,
  RESTGetAPIChannelWebhooksResult,
  RESTJSONErrorCodes,
  RESTPostAPIChannelWebhookResult,
  RESTPostAPIWebhookWithTokenJSONBody,
  RESTPostAPIWebhookWithTokenWaitResult,
  Routes,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import {
  ExpectedFailure,
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors";

interface MinimalWebhook {
  id: Snowflake;
  token: string;
}

export default class WebhookManager {
  private _instance: FastifyInstance;
  constructor(instance: FastifyInstance) {
    this._instance = instance;
  }
  // Update the webhook in the database
  private async _updateStoredWebhook(
    channelId: Snowflake,
    guildId: Snowflake,
    webhook: MinimalWebhook
  ): Promise<void> {
    await this._instance.prisma.channel.upsert({
      where: { id: BigInt(channelId) },
      update: { webhookId: BigInt(webhook.id), webhookToken: webhook.token },
      create: {
        id: BigInt(channelId),
        webhookId: BigInt(webhook.id),
        webhookToken: webhook.token,
        guild: {
          connectOrCreate: {
            where: {
              id: BigInt(guildId),
            },

            create: {
              id: BigInt(guildId),
            },
          },
        },
      },
    });
  }
  // Delete the webhook from the database
  private _removeStoredWebhook(
    channelId: Snowflake,
    guildId: Snowflake
  ): Promise<unknown> {
    return this._instance.prisma.channel.upsert({
      where: { id: BigInt(channelId) },
      update: { webhookId: null, webhookToken: null },
      create: {
        id: BigInt(channelId),
        webhookId: null,
        webhookToken: null,
        guild: {
          connectOrCreate: {
            where: { id: BigInt(guildId) },

            create: {
              id: BigInt(guildId),
            },
          },
        },
      },
    });
  }

  // Fetch an existing webhook owned by the bot
  private async _getWebhookFromDiscord(
    channelId: Snowflake,
    guildId: Snowflake
  ): Promise<MinimalWebhook> {
    let webhooks: RESTGetAPIChannelWebhooksResult;
    try {
      webhooks = (await this._instance.restClient.get(
        Routes.channelWebhooks(channelId)
      )) as RESTGetAPIChannelWebhooksResult;
    } catch (error) {
      if (error instanceof DiscordAPIError) {
        if (error.code === 403 || error.code === 50013) {
          throw new ExpectedFailure(
            InteractionOrRequestFinalStatus.BOT_MISSING_DISCORD_PERMISSION,
            "Missing the permission `MANAGE_WEBHOOKS` on that channel"
          );
        }
        throw error;
      }
      throw error;
    }
    // Filter webhooks by application id, they must match the DISCORD_CLIENT_ID variable
    // This is because we only care about the webhooks created by this application
    const filteredWebhooks = webhooks.filter(
      (webhook) => webhook.application_id === process.env.DISCORD_CLIENT_ID
    );
    // Get the existing webhook id from the database. Just incase the webhook still exists, but the token has been lost
    // This is because the same webhook should be used if possible so messages can be edited
    const storedChannel = await this._instance.prisma.channel.findUnique({
      where: {
        id: BigInt(channelId),
      },
    });
    // then check if any of the webhooks returned by the api match the stored webhook id
    const existingWebhook = filteredWebhooks.find(
      (webhook) => webhook.id === storedChannel?.webhookId?.toString()
    );
    // if the webhook is found, and it has a token, return it
    if (existingWebhook && existingWebhook.token !== undefined) {
      await this._updateStoredWebhook(channelId, guildId, {
        token: existingWebhook.token,
        id: existingWebhook.id,
      });
      return {
        token: existingWebhook.token,
        id: existingWebhook.id,
      };
    }
    // Otherwise use the first webhook that matches the application id, and token is not null
    const firstWebhook = filteredWebhooks.find(
      (webhook) => webhook.token !== undefined
    );

    if (firstWebhook && firstWebhook.token !== undefined) {
      await this._updateStoredWebhook(channelId, guildId, {
        token: firstWebhook.token,
        id: firstWebhook.id,
      });

      return {
        token: firstWebhook.token,
        id: firstWebhook.id,
      };
    }
    // If here this means that there are no webhooks that match the application id, and where there token is not null
    // Therefore we need to create a new webhook

    return await this._createWebhook(channelId, guildId);
  }
  // Create a webhook owned by the bot
  private async _createWebhook(
    channelId: Snowflake,
    guildId: Snowflake
  ): Promise<MinimalWebhook> {
    let webhook: RESTPostAPIChannelWebhookResult;
    try {
      webhook = (await this._instance.restClient.post(
        Routes.channelWebhooks(channelId),
        {
          body: {
            name: "Message Manager Logging",
          },
        }
      )) as RESTPostAPIChannelWebhookResult;
    } catch (error) {
      if (error instanceof DiscordAPIError) {
        if (
          error.status === 403 ||
          error.code === RESTJSONErrorCodes.MissingPermissions
        ) {
          throw new UnexpectedFailure(
            InteractionOrRequestFinalStatus.BOT_MISSING_DISCORD_PERMISSION,
            "Missing the permission `MANAGE_WEBHOOKS` on that channel"
          );
        }
        throw error;
      }
      throw error;
    }
    // This shouldn't happen, but just in case - if it does happen an alert will be sent and this code can be changed
    if (webhook.token === undefined) {
      throw new UnexpectedFailure(
        InteractionOrRequestFinalStatus.CREATE_WEBHOOK_RESULT_MISSING_TOKEN,
        "Webhook token is not defined"
      );
    }
    await this._updateStoredWebhook(channelId, guildId, {
      token: webhook.token,
      id: webhook.id,
    });

    return {
      token: webhook.token,
      id: webhook.id,
    };
  }

  // Public function to get webhook - with logic to find webhooks
  // This function will return the webhook first from the database, then fetch from discord, then create a webhook
  // This is designed with the intention to keep the same webhook being used for the same channel for as long as possible
  public async getWebhook(
    channelId: Snowflake,
    guildId: Snowflake
  ): Promise<MinimalWebhook> {
    const storedChannel = await this._instance.prisma.channel.findUnique({
      where: { id: BigInt(channelId) },
    });
    if (
      !storedChannel ||
      storedChannel.webhookId === null ||
      storedChannel.webhookToken === null
    ) {
      return await this._getWebhookFromDiscord(channelId, guildId);
    }
    return {
      token: storedChannel.webhookToken,
      id: storedChannel.webhookId.toString(),
    };
  }
  // Send a message via a webhook on the channel
  public async sendWebhookMessage(
    channelId: Snowflake,
    guildId: Snowflake,
    data: RESTPostAPIWebhookWithTokenJSONBody,
    files?: RawFile[]
  ): Promise<APIMessage> {
    const webhook = await this.getWebhook(channelId, guildId);
    try {
      const message = (await this._instance.restClient.post(
        Routes.webhook(webhook.id, webhook.token),
        {
          body: data,
          files,
          query: new URLSearchParams({ wait: "true" }),
        }
      )) as RESTPostAPIWebhookWithTokenWaitResult;
      return message;
    } catch (error) {
      if (
        error instanceof DiscordAPIError &&
        error.code === RESTJSONErrorCodes.UnknownWebhook
      ) {
        // If the webhook is not found, it means that it has been deleted, so we need to recreate it
        // First delete the webhook so it is not attempted to be used again, incase creating the webhook fails
        await this._removeStoredWebhook(channelId, guildId);
        await this._createWebhook(channelId, guildId);
        return await this.sendWebhookMessage(channelId, guildId, data, files);
      }
      throw error;
    }
  }
}
