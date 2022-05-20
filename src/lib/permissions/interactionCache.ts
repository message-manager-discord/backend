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
    targetId: Snowflake,
    channelId: Snowflake,
    guildId: Snowflake
  ): string {
    return `${targetId}-${channelId}-${guildId}`;
  }

  private _makeMessageId(messageId: Snowflake, guildId: Snowflake): string {
    return `${messageId}-${guildId}`;
  }

  private async _removeInteractionFromCacheAndDisable({
    messageId,
    guildId,
  }: {
    messageId: Snowflake;
    guildId: Snowflake;
  }): Promise<void> {
    // As we can only keep updating an interaction for a limited time, we need to disable it after 10 mins
    // This function should be cancelled if a new interaction for the same message is received
    const messageCacheId = this._makeMessageId(messageId, guildId);
    const interactionCache = this._interactionCache[messageCacheId];
    if (interactionCache !== undefined) {
      delete this._interactionCache[messageCacheId];
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
            // Ignore this
          } else {
            throw error;
          }
        });
    }
  }

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
    // This function should be called every time /config permissions manage is used
    // and whenever permissions are updated via select interaction
    // "old" interactions from the same message will be discarded as the message id is the same

    const permissionId = this._makePermissionId(
      targetId,
      channelId ?? "none",
      guildId
    );

    const messageCacheId = this._makeMessageId(messageId, guildId);
    const messageWasInCacheBefore =
      this._interactionCache[messageCacheId] !== undefined;

    if (messageWasInCacheBefore) {
      // then cancel the timeout otherwise the interaction will be removed before it is needed to be
      // receiving another interaction extends the time limit for that message
      clearTimeout(this._interactionCache[messageCacheId].timeoutId);
    }

    // Set a timeout to remove and disable the interaction after 10 mins
    const timeoutId = setTimeout(() => {
      void this._removeInteractionFromCacheAndDisable({
        messageId,
        guildId,
      });
    }, 10 * 60 * 1000);
    this._interactionCache[messageCacheId] = {
      interactionId,
      interactionToken,
      timeoutId,
      createAt: new Date(),
    };
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

  public async triggerUpdates({
    targetId,
    channelId,
    guildId,
    triggerMessageId,
  }: {
    targetId: Snowflake;
    channelId: Snowflake | null;
    guildId: Snowflake;
    triggerMessageId: Snowflake | null; // The message that caused the update. If set that message should be ignored
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
      });
      for (const messageCacheId of messageCacheIds.messageIds) {
        const interactionCache = this._interactionCache[messageCacheId];

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
