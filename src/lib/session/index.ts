import { RawFile } from "@discordjs/rest";
import { Snowflake } from "discord-api-types/globals";
import {
  APIDMInteraction,
  APIEmbed,
  APIGuildInteraction,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import { Guild, GuildManager } from "redis-discord-cache";
import {
  GuildNotFound,
  GuildUnavailable,
} from "redis-discord-cache/dist/errors";

import {
  ExpectedPermissionFailure,
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors";
import {
  checkBotDiscordPermission,
  checkUserDiscordPermission,
} from "../permissions/discord";
import PermissionManager from "../permissions/manager";
import {
  BotPermissionResult,
  DiscordPermissionResult,
} from "../permissions/types";

class GuildSession {
  userId: Snowflake;
  userRoles: Snowflake[];
  userInteractionCalculatedChannelPermissions: bigint;
  guildId: Snowflake;
  private _cachedGuild: Guild | undefined;
  private _permissionsManager: PermissionManager;
  private _instance: FastifyInstance;
  private _guildManager: GuildManager;
  constructor({
    userId,
    userRoles,
    guildId,

    userInteractionCalculatedChannelPermissions,
    instance,
  }: {
    userId: Snowflake;
    userRoles: Snowflake[];
    guildId: Snowflake;
    userInteractionCalculatedChannelPermissions: bigint;
    instance: FastifyInstance;
  }) {
    this.userId = userId;
    this.userRoles = userRoles;
    this.guildId = guildId;

    this.userInteractionCalculatedChannelPermissions =
      userInteractionCalculatedChannelPermissions;
    this._permissionsManager = instance.permissionManager;
    this._guildManager = instance.redisGuildManager;
    this._instance = instance;
  }

  private async _getCachedGuild(): Promise<Guild> {
    if (!this._cachedGuild) {
      const cachedGuild = await this._guildManager.getGuild(this.guildId);
      try {
        await cachedGuild.ownerId;
        // This will check if the guild is in cache or not
        // This means that there is a central place for managing if a guild is in cache or not
      } catch (e) {
        if (e instanceof GuildNotFound) {
          throw new ExpectedPermissionFailure(
            InteractionOrRequestFinalStatus.BOT_MISSING_DISCORD_SCOPE,
            `Guild ${this.guildId} not cached. This is likely due to the bot missing the \`bot\` scope. Please reinvite the bot to fix this.`
          );
        } else if (e instanceof GuildUnavailable) {
          throw new UnexpectedFailure(
            InteractionOrRequestFinalStatus.GUILD_UNAVAILABLE_BUT_SENDING_INTERACTIONS,
            `Guild ${this.guildId} is unavailable. This is likely due to the bot being offline. Please try again later, and if this error persists, please contact the bot developers.`
          );
        } else {
          throw e;
        }
      }
      this._cachedGuild = cachedGuild;
    }
    return this._cachedGuild;
  }

  get cachedGuild(): Promise<Guild> {
    return this._getCachedGuild();
  }

  async hasBotPermissions(
    permissions: number | number[],
    channelId: Snowflake | undefined
  ): Promise<BotPermissionResult> {
    return this._permissionsManager.hasPermissions(
      this.userId,
      this.userRoles,
      await this.cachedGuild,
      permissions,
      channelId
    );
  }
  async hasDiscordPermissions(
    permissions: bigint | bigint[],
    channelId: Snowflake | undefined
  ): Promise<DiscordPermissionResult> {
    return checkUserDiscordPermission({
      userId: this.userId,
      userRoles: this.userRoles,
      channelId,
      guild: await this.cachedGuild,
      requiredPermissions: permissions,
    });
  }
  async botHasDiscordPermissions(
    permissions: bigint | bigint[],
    channelId: Snowflake | undefined
  ): Promise<DiscordPermissionResult> {
    return checkBotDiscordPermission({
      guild: await this.cachedGuild,
      channelId,
      requiredPermissions: permissions,
    });
  }

  async sendLoggingMessage({
    logEmbeds,
    message,
    files,
  }: {
    logEmbeds?: APIEmbed[];
    message?: string;
    files?: RawFile[];
  }): Promise<void> {
    await this._instance.loggingManager.sendLogMessage({
      embeds: logEmbeds,
      message,
      files,
      guildId: this.guildId,
      ignoreErrors: true,
      session: this,
    });
  }
}

class NonGuildSession {}

const interactionIsFromGuild = (
  interaction: APIDMInteraction | APIGuildInteraction
): interaction is APIGuildInteraction => {
  return (interaction as APIGuildInteraction).guild_id !== undefined;
};

export default class SessionManager {
  private _instance: FastifyInstance;
  constructor({ instance }: { instance: FastifyInstance }) {
    this._instance = instance;
  }

  createSessionFromInteraction(interaction: APIGuildInteraction): GuildSession;
  createSessionFromInteraction(interaction: APIDMInteraction): NonGuildSession;
  createSessionFromInteraction(
    interaction: APIGuildInteraction | APIDMInteraction
  ): NonGuildSession | GuildSession {
    if (interactionIsFromGuild(interaction)) {
      return new GuildSession({
        userId: interaction.member.user.id,
        userRoles: interaction.member.roles,
        guildId: interaction.guild_id,
        userInteractionCalculatedChannelPermissions: BigInt(
          interaction.member.permissions
        ),
        instance: this._instance,
      });
    } else {
      return new NonGuildSession();
    }
  }
}

export { GuildSession, NonGuildSession };
