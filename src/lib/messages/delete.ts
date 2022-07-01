import { DiscordAPIError, RawFile } from "@discordjs/rest";
import { EmbedField, Message, MessageEmbed } from "@prisma/client";
import {
  APIEmbed,
  APIEmbedAuthor,
  APIEmbedFooter,
  Routes,
  Snowflake,
} from "discord-api-types/v9";
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
import { checkDatabaseMessage } from "./checks";
import { requiredPermissionsDelete } from "./consts";
import { StoredEmbed } from "./embeds/types";
import {
  missingBotDiscordPermissionMessage,
  missingUserDiscordPermissionMessage,
} from "./utils";

interface DeleteOptions {
  channelId: Snowflake;
  messageId: Snowflake;
  instance: FastifyInstance;
  session: GuildSession;
}

const missingAccessMessage =
  "You do not have access to the bot permission for deleting messages via the bot on this guild. Please contact an administrator.";

// Map array of bigints to array of strings, when the string is not undefined
// Using the function getDiscordPermissionByValue to turn the bigint into a string | undefined

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

async function deleteMessage({
  channelId,
  instance,
  messageId,
  session,
}: DeleteOptions) {
  await checkDeletePossible({ channelId, instance, messageId, session });
  try {
    await instance.restClient.delete(
      Routes.channelMessage(channelId, messageId)
    );
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
      throw new UnexpectedFailure(
        InteractionOrRequestFinalStatus.MESSAGE_NOT_FOUND_IN_DATABASE_AFTER_CHECKS_DONE,
        "MESSAGE_NOT_FOUND_IN_DATABASE_AFTER_CHECKS_DONE"
      );
    }
    // this is also a create, as messages will form a message history
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
    let embedBefore: StoredEmbed | undefined = undefined;
    if (messageBefore?.embed !== null && messageBefore?.embed !== undefined) {
      let footer: APIEmbedFooter | undefined = undefined;
      if (messageBefore.embed.footerText !== null) {
        footer = {
          text: messageBefore.embed.footerText,
          icon_url: messageBefore.embed.footerIconUrl ?? undefined,
        };
      }
      let author: APIEmbedAuthor | undefined = undefined;
      if (messageBefore.embed.authorName !== null) {
        author = {
          name: messageBefore.embed.authorName,
          url: messageBefore.embed.authorUrl ?? undefined,
          icon_url: messageBefore.embed.authorIconUrl ?? undefined,
        };
      }

      embedBefore = {
        title: messageBefore.embed.title ?? undefined,
        description: messageBefore.embed.description ?? undefined,
        url: messageBefore.embed.url ?? undefined,
        timestamp: messageBefore.embed.timestamp?.toISOString() ?? undefined,
        color: messageBefore.embed.color ?? undefined,
        footer: footer,
        author: author,
        fields: messageBefore.embed.fields ?? undefined,
        thumbnail:
          messageBefore.embed.thumbnailUrl !== null
            ? {
                url: messageBefore.embed.thumbnailUrl,
              }
            : undefined,
      };
    }

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
    await instance.loggingManager.sendLogMessage({
      guildId: session.guildId,
      embeds: [logEmbed],
      files,
    });
  } catch (error) {
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
