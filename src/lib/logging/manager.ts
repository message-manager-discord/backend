import { Snowflake } from "discord-api-types/globals";
import { APIEmbed, APIMessage } from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import WebhookManager from "../webhook/manager";

export default class LoggingManager {
  _webhookManager: WebhookManager;
  _instance: FastifyInstance;
  constructor(webhookManager: WebhookManager, instance: FastifyInstance) {
    this._webhookManager = webhookManager;
    this._instance = instance;
  }
  async getGuildLoggingChannel(guildId: Snowflake): Promise<Snowflake | null> {
    const guild = await this._instance.prisma.guild.findUnique({
      where: { id: BigInt(guildId) },
    });
    if (!guild || !guild.logChannelId) {
      return null;
    }
    return guild.logChannelId.toString();
  }
  public async setGuildLoggingChannel(
    guildId: Snowflake,
    channelId: Snowflake
  ): Promise<Snowflake | null> {
    await this._webhookManager.getWebhook(channelId, guildId);
    // This will either change nothing (if a webhook is already set) or create a new webhook and store it
    // It is before the guild config is updated, incase the bot is missing the required permissions
    const beforeChannelId = await this.getGuildLoggingChannel(guildId);
    await this._instance.prisma.guild.upsert({
      where: { id: BigInt(guildId) },
      update: { logChannelId: BigInt(channelId) },
      create: { id: BigInt(guildId), logChannelId: BigInt(channelId) },
    });
    return beforeChannelId;
  }
  public async removeGuildLoggingChannel(
    guildId: Snowflake
  ): Promise<Snowflake | null> {
    const beforeChannelId = this.getGuildLoggingChannel(guildId);
    await this._instance.prisma.guild.update({
      where: { id: BigInt(guildId) },
      data: { logChannelId: null },
    });
    return beforeChannelId;
    // Webhook data is not touched here, as webhooks can be used for different functions (in the future)
  }
  public async sendLogMessage({
    guildId,
    ignoreErrors,
    message,
    embeds,
  }: {
    guildId: Snowflake;

    ignoreErrors?: boolean;
    message?: string;
    embeds: APIEmbed[] | undefined;
  }): Promise<APIMessage | void> {
    // Logs can be "passed" if the channel isn't set, or if the webhook doesn't exist and the bot cannot create a new webhook
    // This means that this function can be called without checking if the log channel is set
    // It's because the logging function is an extra
    const channelId = await this.getGuildLoggingChannel(guildId);
    if (!channelId) {
      return;
    }
    const data = {
      content: message,
      embeds,
      username: "Message Manager Logging",
      avatarUrl: this._instance.envVars.AVATAR_URL,
    };

    try {
      return this._webhookManager.sendWebhookMessage(channelId, guildId, data);
      // eslint-disable-next-line no-empty
    } catch (error) {
      if (!ignoreErrors) {
        throw error;
      }
      // Log messages should be sent, but if they fail, it's not a big deal and shouldn't then affect normal running of the bot
    }
  }
}
