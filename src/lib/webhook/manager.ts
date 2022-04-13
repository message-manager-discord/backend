import { RequestTypes } from "detritus-client-rest";
import { DiscordHTTPError } from "detritus-client-rest/lib/errors";
import { Snowflake } from "discord-api-types/globals";
import {
  APIMessage,
  RESTGetAPIChannelWebhooksResult,
  RESTPostAPIChannelWebhookResult,
  RESTPostAPIWebhookWithTokenWaitResult,
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

// Should also check if detrius handles webhook ratelimiting.

export default class WebhookManager {
  private _instance: FastifyInstance;
  constructor(instance: FastifyInstance) {
    this._instance = instance;
  }
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
        guildId: BigInt(guildId),
        webhookId: BigInt(webhook.id),
        webhookToken: webhook.token,
      },
    });
  }

  private async _getWebhookFromDiscord(
    channelId: Snowflake,
    guildId: Snowflake
  ): Promise<MinimalWebhook> {
    let webhooks: RESTGetAPIChannelWebhooksResult;
    try {
      webhooks = (await this._instance.restClient.fetchChannelWebhooks(
        channelId
      )) as RESTGetAPIChannelWebhooksResult;
    } catch (error) {
      console.log("AH 1");
      if (error instanceof DiscordHTTPError) {
        console.log(error.code);
        if (error.code === 403 || error.code === 50013) {
          throw new ExpectedFailure(
            InteractionOrRequestFinalStatus.BOT_MISSING_DISCORD_PERMISSION,
            "Missing the permission `MANAGE_WEBHOOKS` on that channel"
          );
        }
        console.log("AH 2");
        throw error;
      }
      console.log("AH 3");
      throw error;
    }
    // Filter webhooks by application id, they must match the DISCORD_CLIENT_ID variable
    // This is because we only care about the webhooks created by this application
    const filteredWebhooks = webhooks.filter(
      (webhook) => webhook.application_id === process.env.DISCORD_CLIENT_ID
    );
    // Get the existing webhook id from the database. Just incase the webhook still exists, but the token has been lost
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
    if (existingWebhook && existingWebhook.token) {
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
    const firstWebhook = filteredWebhooks.find((webhook) => !!webhook.token);

    if (firstWebhook && firstWebhook.token) {
      await this._updateStoredWebhook(channelId, guildId, {
        token: firstWebhook.token,
        id: firstWebhook.id,
      });

      return {
        token: firstWebhook.token,
        id: firstWebhook.id,
      };
    }
    // If here this means that there are no webhooks that match the application id, and the token is null
    // Therefore we need to create a new webhook
    return await this._createWebhook(channelId, guildId);
  }
  private async _createWebhook(
    channelId: Snowflake,
    guildId: Snowflake
  ): Promise<MinimalWebhook> {
    let webhook: RESTPostAPIChannelWebhookResult;
    try {
      webhook = (await this._instance.restClient.createWebhook(channelId, {
        name: "Message Manager Logging",
      })) as RESTPostAPIChannelWebhookResult;
    } catch (error) {
      if (error instanceof DiscordHTTPError) {
        if (error.code === 403 || error.code === 50013) {
          throw new UnexpectedFailure(
            InteractionOrRequestFinalStatus.BOT_MISSING_DISCORD_PERMISSION,
            "Missing the permission `MANAGE_WEBHOOKS` on that channel"
          );
        }
        throw error;
      }
      throw error;
    }
    // This shouldn't happen, but just in case
    if (!webhook.token) {
      throw new UnexpectedFailure(
        InteractionOrRequestFinalStatus.CREATE_WEBHOOK_RESULT_MISSING_TOKEN,
        "Webhook token is null"
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
  public async getWebhook(
    channelId: Snowflake,
    guildId: Snowflake
  ): Promise<MinimalWebhook> {
    // This function will return the webhook first from the database, then fetch from discord, then create a webhook
    // This is designed with the intention to keep the same webhook being used for the same channel for as long as possible
    const storedChannel = await this._instance.prisma.channel.findUnique({
      where: { id: BigInt(channelId) },
    });
    if (
      !storedChannel ||
      !storedChannel.webhookId ||
      !storedChannel.webhookToken
    ) {
      return await this._getWebhookFromDiscord(channelId, guildId);
    }
    return {
      token: storedChannel.webhookToken,
      id: storedChannel.webhookId.toString(),
    };
  }
  public async sendWebhookMessage(
    channelId: Snowflake,
    guildId: Snowflake,
    data: RequestTypes.ExecuteWebhook
  ): Promise<APIMessage> {
    const webhook = await this.getWebhook(channelId, guildId);
    if (!data.wait) {
      // Always wait for the message to send
      data.wait = true;
    }
    const message = (await this._instance.restClient.executeWebhook(
      webhook.id,
      webhook.token,
      data
    )) as RESTPostAPIWebhookWithTokenWaitResult;
    return message;
  }
}
