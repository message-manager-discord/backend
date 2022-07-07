import { RawFile, DiscordAPIError } from "@discordjs/rest";
import { Snowflake } from "discord-api-types/globals";
import { APIEmbed, APIMessage, RESTJSONErrorCodes } from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import { DiscordPermissions } from "../../consts";
import {
  ExpectedPermissionFailure,
  InteractionOrRequestFinalStatus,
} from "../../errors";
import { InternalPermissions } from "../permissions/consts";
import { checkDiscordPermissionValue } from "../permissions/utils";
import { GuildSession } from "../session";
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
    if (!guild || guild.logChannelId === null) {
      return null;
    }
    return guild.logChannelId.toString();
  }
  private async _loggingPermissionChecks(session: GuildSession): Promise<true> {
    if (
      !checkDiscordPermissionValue(
        BigInt(session.userInteractionCalculatedChannelPermissions),
        DiscordPermissions.ADMINISTRATOR
      ) &&
      !(
        await session.hasBotPermissions(
          InternalPermissions.MANAGE_CONFIG,
          undefined
        )
      ).allPresent
    ) {
      throw new ExpectedPermissionFailure(
        InteractionOrRequestFinalStatus.USER_MISSING_INTERNAL_BOT_PERMISSION,
        "You are missing the `MANAGE_CONFIG` permission"
      );
    }
    return true;
  }

  public async setGuildLoggingChannel(
    channelId: Snowflake,
    session: GuildSession
  ): Promise<Snowflake | null> {
    await this._loggingPermissionChecks(session);
    await this._webhookManager.getWebhook(channelId, session.guildId);
    // This will either change nothing (if a webhook is already set) or create a new webhook and store it
    // It is before the guild config is updated, incase the bot is missing the required permissions
    const beforeChannelId = await this.getGuildLoggingChannel(session.guildId);
    await this._instance.prisma.guild.upsert({
      where: { id: BigInt(session.guildId) },
      update: { logChannelId: BigInt(channelId) },
      create: { id: BigInt(session.guildId), logChannelId: BigInt(channelId) },
    });
    return beforeChannelId;
  }
  public async removeGuildLoggingChannel(
    session: GuildSession
  ): Promise<Snowflake | null> {
    await this._loggingPermissionChecks(session);
    const beforeChannelId = this.getGuildLoggingChannel(session.guildId);
    await this._instance.prisma.guild.update({
      where: { id: BigInt(session.guildId) },
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
    files,
    session,
  }: {
    guildId: Snowflake;

    ignoreErrors?: boolean;
    message?: string;
    embeds: APIEmbed[] | undefined;
    files?: RawFile[];
    session: GuildSession;
  }): Promise<APIMessage | void> {
    // Logs can be "passed" if the channel isn't set, or if the webhook doesn't exist and the bot cannot create a new webhook
    // This means that this function can be called without checking if the log channel is set
    // It's because the logging function is an extra
    const channelId = await this.getGuildLoggingChannel(guildId);
    if (channelId === null) {
      return;
    }
    const data = {
      content: message,
      embeds,
      username: "Message Manager Logging",
      avatarUrl: this._instance.envVars.AVATAR_URL,
    };

    try {
      return await this._webhookManager.sendWebhookMessage(
        // TODO: ADD AWAIT
        channelId,
        guildId,
        data,
        files
      );
      // eslint-disable-next-line no-empty
    } catch (error) {
      if (
        error instanceof DiscordAPIError &&
        error.code === RESTJSONErrorCodes.UnknownChannel
      ) {
        // remove channel
        // This threw on the attempt to add / create a webhook on the channel
        // This is because the channel doesn't exist anymore
        await this.removeGuildLoggingChannel(session);
        return;
      }

      if (!(ignoreErrors ?? false)) {
        throw error;
      }
      // Log messages should be sent, but if they fail, it's not a big deal and shouldn't then affect normal running of the bot
    }
  }
}
