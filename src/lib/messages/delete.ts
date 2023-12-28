// Delete a message that was sent by the bot
import { DiscordAPIError, RawFile } from "@discordjs/rest";
import { EmbedField, Message, MessageEmbed } from "@prisma/client";
import { APIEmbed, Routes, Snowflake } from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import { embedPink } from "../../constants";
import { parseDiscordPermissionValuesToStringNames } from "../../consts";
import {
  ExpectedPermissionFailure,
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors";
import { InternalPermissions } from "../permissions/consts";
import { GuildSession } from "../session";
import { checkDatabaseMessage } from "#root/checks";
import { requiredPermissionsDelete } from "#root/consts";
import { createStoredEmbedFromDataBaseEmbed } from "#root/embeds/parser";
import { StoredEmbed } from "#root/embeds/types";
import {
  missingBotDiscordPermissionMessage,
  missingUserDiscordPermissionMessage,
} from "#root/utils";

// Options interface for function
interface DeleteOptions {
  channelId: Snowflake;
  messageId: Snowflake;
  instance: FastifyInstance;
  session: GuildSession;
}

const missingAccessMessage =
  "You do not have access to the bot permission for deleting messages via the bot on this guild. Please contact an administrator.";

// Check permissions and message state before deleting
const checkDeletePossible = async ({
  channelId,
  instance,
  messageId,
  session,
}: DeleteOptions): Promise<
  Message & {
    embed:
      | (MessageEmbed & {
          fields: EmbedField[];
        })
      | null;
  }
> => {
  // Check if the user has the discord permission to delete messages
  const userHasViewChannel = await session.hasDiscordPermissions(
    requiredPermissionsDelete,
    channelId
  );
  if (!userHasViewChannel.allPresent) {
    throw new ExpectedPermissionFailure(
      InteractionOrRequestFinalStatus.USER_MISSING_DISCORD_PERMISSION,

      missingUserDiscordPermissionMessage(
        parseDiscordPermissionValuesToStringNames(userHasViewChannel.missing),
        channelId
      )
    );
  }
  // Check if the bot has the discord permission to delete messages
  const botHasViewChannel = await session.botHasDiscordPermissions(
    requiredPermissionsDelete,
    channelId
  );
  if (!botHasViewChannel.allPresent) {
    throw new ExpectedPermissionFailure(
      InteractionOrRequestFinalStatus.BOT_MISSING_DISCORD_PERMISSION,
      missingBotDiscordPermissionMessage(
        parseDiscordPermissionValuesToStringNames(botHasViewChannel.missing),
        channelId
      )
    );
  }
  // Check if the message is in database and it is valid
  const databaseMessage = await instance.prisma.message.findFirst({
    where: { id: BigInt(messageId) },
    orderBy: { editedAt: "desc" }, // Needs to be ordered, as this is returned
    include: {
      embed: {
        include: {
          fields: true,
        },
      },
    },
  });
  if (!checkDatabaseMessage(databaseMessage)) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.GENERIC_UNEXPECTED_FAILURE,
      "Message check returned falsy like value when it should only return true"
    );
  }

  // Check if the user has the internal permission to delete messages
  const userHasDeleteMessagesBotPermission = await session.hasBotPermissions(
    InternalPermissions.DELETE_MESSAGES,
    channelId
  );
  if (!userHasDeleteMessagesBotPermission.allPresent) {
    throw new ExpectedPermissionFailure(
      InteractionOrRequestFinalStatus.USER_MISSING_INTERNAL_BOT_PERMISSION,
      missingAccessMessage
    );
  }

  return databaseMessage;
};

// Delete a message that was sent by the bot
async function deleteMessage({
  channelId,
  instance,
  messageId,
  session,
}: DeleteOptions) {
  // Check if the user has the discord permission to delete messages
  await checkDeletePossible({ channelId, instance, messageId, session });
  try {
    // Delete the message through the API
    await instance.restClient.delete(
      Routes.channelMessage(channelId, messageId)
    );
    // Get message before - this is for logging
    const messageBefore = await instance.prisma.message.findFirst({
      where: { id: BigInt(messageId) },

      orderBy: { editedAt: "desc" },
      include: {
        embed: {
          include: {
            fields: true,
          },
        },
      },
    });
    if (!messageBefore) {
      // Shouldn't happen - as should have been checked in checkDeletePossible
      throw new UnexpectedFailure(
        InteractionOrRequestFinalStatus.MESSAGE_NOT_FOUND_IN_DATABASE_AFTER_CHECKS_DONE,
        "MESSAGE_NOT_FOUND_IN_DATABASE_AFTER_CHECKS_DONE"
      );
    }
    // This is also a create call, as messages entries will form a message history
    await instance.prisma.message.create({
      data: {
        id: BigInt(messageId),
        content: messageBefore.content,
        deleted: true,

        editedAt: new Date(Date.now()),
        editedBy: BigInt(session.userId),
        channel: {
          connectOrCreate: {
            where: {
              id: BigInt(channelId),
            },

            create: {
              id: BigInt(channelId),
              guildId: BigInt(session.guildId),
            },
          },
        },
        guild: {
          connectOrCreate: {
            where: {
              id: BigInt(session.guildId),
            },

            create: {
              id: BigInt(session.guildId),
            },
          },
        },
      },
    });
    // Generate deleted log message
    const logEmbed: APIEmbed = {
      color: embedPink,
      title: "Message Deleted",
      description:
        `Message (${messageId}) deleted` +
        `${
          messageBefore.content !== null && messageBefore.content !== ""
            ? `\n\n**Message Content:**\n${messageBefore.content}`
            : messageBefore.content === ""
            ? "\n**Message Content was empty**"
            : ""
        }`,
      fields: [
        { name: "Action By:", value: `<@${session.userId}>`, inline: true },
        { name: "Channel:", value: `<#${channelId}>`, inline: true },
      ],
      timestamp: new Date().toISOString(),
    };
    // Generate embed representation if embed was present before
    let embedBefore: StoredEmbed | undefined = undefined;
    if (messageBefore?.embed !== null && messageBefore?.embed !== undefined) {
      embedBefore = createStoredEmbedFromDataBaseEmbed(messageBefore.embed);
    }

    // Generate log embed file - if embed should be in file
    const files: RawFile[] = [];
    if (embedBefore !== undefined) {
      files.push({
        name: "embed.json",
        data: JSON.stringify(embedBefore, undefined, 2),
      });
      logEmbed.description +=
        "\n\nEmbed representation can be found in the attachment.";
    }
    // Send log message
    await session.sendLoggingMessage({
      logEmbeds: [logEmbed],
      files: files,
    });
  } catch (error) {
    // Catch errors that may be thrown by the API
    if (error instanceof DiscordAPIError) {
      if (error.code === 404) {
        throw new UnexpectedFailure(
          InteractionOrRequestFinalStatus.CHANNEL_NOT_FOUND_DISCORD_HTTP,
          "Channel not found"
        );
      } else if (error.code === 403 || error.code === 50013) {
        throw new UnexpectedFailure(
          InteractionOrRequestFinalStatus.MISSING_PERMISSIONS_DISCORD_HTTP_SEND_MESSAGE,
          error.message
        );
      }
      throw error;
    }
    throw error;
  }
}

export { checkDeletePossible, deleteMessage };
