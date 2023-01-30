// Caches an interaction's id and token - this is so the interaction can be updated from actions by other interactions
// This is used in the permission's editing flow, so if other users are editing permissions at that time
// there are no clashes

import axios, { AxiosError, AxiosResponse } from "axios";
import { Snowflake } from "discord-api-types/globals";
import { APIEmbed } from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import { discordAPIBaseURL } from "../../constants";
import { embedPink } from "../../constants";
import createPermissionsEmbed from "../../interactions/shared/permissions-config";
import { addTipToEmbed } from "../../lib/tips";

// The idea behind this is to prevent interactions from becoming outdated

class PermissionInteractionCache {
  private _interactionCache: {
    [messageId: Snowflake]: {
      interactionId: Snowflake;
      interactionToken: Snowflake;
      timeoutId: NodeJS.Timeout;
      createAt: Date;
    };
  };
  private _permissionsToMessageIdMapping: {
    [permissionId: string]: {
      targetType: "user" | "role";
      messageIds: Snowflake[];
    };
  };
  private _instance: FastifyInstance;
  constructor(instance: FastifyInstance) {
    this._instance = instance;
    this._interactionCache = {};
    this._permissionsToMessageIdMapping = {};
  }

  private _makePermissionId(
    targetId: Snowflake, // The target of the permission editing - either a user or a role
    channelId: Snowflake, // Channel id the permission is for - if it is for guild level, then it is "none"
    guildId: Snowflake // The guild id the permission is for
  ): string {
    return `${targetId}-${channelId}-${guildId}`;
  }

  private _makeMessageId(messageId: Snowflake, guildId: Snowflake): string {
    return `${messageId}-${guildId}`;
  }

  // As we can only keep updating an interaction for a limited time, we need to disable it after 10 mins
  // This function should be cancelled if a new interaction for the same message is received (the 10min timeout is reset)
  // as the new interaction can now be used - extending the time
  private async _removeInteractionFromCacheAndDisable({
    messageId,
    guildId,
  }: {
    messageId: Snowflake;
    guildId: Snowflake;
  }): Promise<void> {
    const messageCacheId = this._makeMessageId(messageId, guildId);
    const interactionCache = this._interactionCache[messageCacheId];
    if (interactionCache !== undefined) {
      delete this._interactionCache[messageCacheId];
      // Disable the embed
      const embed: APIEmbed = addTipToEmbed({
        title: "Permissions Management Timeout",
        description:
          "This permissions management session has timed out due to inactivity. Please redo the initial command.",
        color: embedPink,
        timestamp: new Date().toISOString(),
      });
      await axios
        .request({
          method: "PATCH",
          url: `${discordAPIBaseURL}/webhooks/${this._instance.envVars.DISCORD_CLIENT_ID}/${interactionCache.interactionToken}/messages/@original`,
          data: { embeds: [embed], components: [], content: "" },
        })
        .catch((error) => {
          if (
            ((error as AxiosError).response as AxiosResponse).status === 404
          ) {
            // The interaction was deleted
            // This can happen if the interaction was deleted by the user
            // Remove from cache
            delete this._interactionCache[messageCacheId];
          } else if (
            ((error as AxiosError).response as AxiosResponse).status === 429
          ) {
            // Ignore this - shouldn't happen either but it's fine to drop
          } else {
            throw error;
          }
        });
    }
  }

  /* This function should be called every time /config permissions manage is used
  and whenever permissions are updated via select interaction
  "old" interactions from the same message will be discarded as the message id is the same */
  public registerInteraction({
    targetId,
    targetType,
    channelId,
    guildId,
    messageId,
    interactionId,
    interactionToken,
  }: {
    targetId: Snowflake;
    targetType: "user" | "role";
    channelId: Snowflake | null;
    guildId: Snowflake;
    messageId: Snowflake;
    interactionId: Snowflake;
    interactionToken: string;
  }) {
    const permissionId = this._makePermissionId(
      targetId,
      channelId ?? "none",
      guildId
    );

    const messageCacheId = this._makeMessageId(messageId, guildId);
    const messageWasInCacheBefore =
      this._interactionCache[messageCacheId] !== undefined;

    if (messageWasInCacheBefore) {
      // Then cancel the timeout otherwise the interaction will be removed before it is needed to be removed
      // Receiving another interaction extends the time limit for that message
      clearTimeout(this._interactionCache[messageCacheId].timeoutId);
    }

    // Set a timeout to remove and disable the interaction after 10 mins
    const timeoutId = setTimeout(() => {
      void this._removeInteractionFromCacheAndDisable({
        messageId,
        guildId,
      });
    }, 10 * 60 * 1000);
    // Save the interaction data in cache
    this._interactionCache[messageCacheId] = {
      interactionId,
      interactionToken,
      timeoutId,
      createAt: new Date(),
    };
    // One to Many relationship in cache - one permission flow can have multiple messages
    if (this._permissionsToMessageIdMapping[permissionId] === undefined) {
      this._permissionsToMessageIdMapping[permissionId] = {
        targetType,
        messageIds: [messageCacheId],
      };
    } else {
      if (
        !this._permissionsToMessageIdMapping[permissionId].messageIds.includes(
          messageCacheId
        )
      ) {
        this._permissionsToMessageIdMapping[permissionId].messageIds.push(
          messageCacheId
        );
      }
    }
  }

  // Should be called for all updates to permissions
  public async triggerUpdates({
    targetId,
    channelId,
    guildId,
    triggerMessageId,
  }: {
    targetId: Snowflake;
    channelId: Snowflake | null;
    guildId: Snowflake;
    triggerMessageId: Snowflake | null; // The message that caused the update. If set that message should be ignored in the update
  }): Promise<void> {
    // This function is called every time a permission is updated
    const permissionId = this._makePermissionId(
      targetId,
      channelId ?? "none",
      guildId
    );
    const messageCacheIds = this._permissionsToMessageIdMapping[permissionId];

    if (messageCacheIds !== undefined) {
      const permissionEmbedData = await createPermissionsEmbed({
        targetType: messageCacheIds.targetType,
        targetId,
        channelId: channelId ?? null,
        guildId,
        instance: this._instance,
        first: false,
        hasAdminPermission: false, // It's just a hint, doesn't matter if it goes away. Too hard / inaccurate to track this
      });
      for (const messageCacheId of messageCacheIds.messageIds) {
        const interactionCache = this._interactionCache[messageCacheId];
        // Check if the message is the one that triggered the update
        if (
          (triggerMessageId === null ||
            messageCacheId !==
              this._makeMessageId(triggerMessageId, guildId)) &&
          interactionCache !== undefined
        ) {
          await axios
            .request({
              method: "PATCH",
              url: `${discordAPIBaseURL}/webhooks/${this._instance.envVars.DISCORD_CLIENT_ID}/${interactionCache.interactionToken}/messages/@original`,
              data: {
                embeds: [permissionEmbedData.embed],
                components: permissionEmbedData.components,
              },
            })
            .catch((error) => {
              if (
                ((error as AxiosError).response as AxiosResponse).status === 404
              ) {
                // The interaction was deleted
                // This can happen if the interaction was deleted by the user
                // Remove from cache
                delete this._interactionCache[messageCacheId];
                console.log("Was deleted");
              } else if (
                ((error as AxiosError).response as AxiosResponse).status === 429
              ) {
                // Ignore this
              } else {
                throw error;
              }
            });
        }
      }
    }
  }
}
export default PermissionInteractionCache;
