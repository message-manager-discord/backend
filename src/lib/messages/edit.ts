import { DiscordAPIError, RawFile } from "@discordjs/rest";
import { EmbedField, Message, MessageEmbed, Prisma } from "@prisma/client";
import {
  APIEmbed,
  APIEmbedAuthor,
  APIEmbedFooter,
  Routes,
  Snowflake,
} from "discord-api-types/v9";
import { RESTPatchAPIChannelMessageResult } from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import { embedPink } from "../../constants";
import { parseDiscordPermissionValuesToStringNames } from "../../consts";
import {
  ExpectedFailure,
  ExpectedPermissionFailure,
  InteractionOrRequestFinalStatus,
  LimitHit,
  UnexpectedFailure,
} from "../../errors";
import limits from "../../limits";
import { InternalPermissions } from "../permissions/consts";
import { GuildSession } from "../session";
import { checkDatabaseMessage } from "./checks";
import { requiredPermissionsEdit } from "./consts";
import { checkEmbedMeetsLimits } from "./embeds/checks";
import {
  createSendableEmbedFromStoredEmbed,
  createStoredEmbedFromAPIMessage,
} from "./embeds/parser";
import { StoredEmbed } from "./embeds/types";
import {
  missingBotDiscordPermissionMessage,
  missingUserDiscordPermissionMessage,
} from "./utils";

interface CheckEditPossibleOptions {
  channelId: Snowflake;
  messageId: Snowflake;
  instance: FastifyInstance;
  session: GuildSession;
}

const missingAccessMessage =
  "You do not have access to the bot permission for editing messages via the bot on this guild. Please contact an administrator.";

const checkEditPossible = async ({
  channelId,
  instance,
  messageId,
  session,
}: CheckEditPossibleOptions): Promise<
  Message & {
    embed:
      | (MessageEmbed & {
          fields: EmbedField[];
        })
      | null;
  }
> => {
  const userHasRequiredDiscordPermissions = await session.hasDiscordPermissions(
    requiredPermissionsEdit,
    channelId
  );
  if (!userHasRequiredDiscordPermissions.allPresent) {
    throw new ExpectedPermissionFailure(
      InteractionOrRequestFinalStatus.USER_MISSING_DISCORD_PERMISSION,
      missingUserDiscordPermissionMessage(
        parseDiscordPermissionValuesToStringNames(
          userHasRequiredDiscordPermissions.missing
        ),
        channelId
      )
    );
  }

  const botHasRequiredDiscordPermissions =
    await session.botHasDiscordPermissions(requiredPermissionsEdit, channelId);

  if (!botHasRequiredDiscordPermissions.allPresent) {
    throw new ExpectedPermissionFailure(
      InteractionOrRequestFinalStatus.BOT_MISSING_DISCORD_PERMISSION,
      missingBotDiscordPermissionMessage(
        parseDiscordPermissionValuesToStringNames(
          botHasRequiredDiscordPermissions.missing
        ),
        channelId
      )
    );
  }

  const databaseMessage = await instance.prisma.message.findFirst({
    where: { id: BigInt(messageId) },
    include: {
      embed: {
        include: {
          fields: true,
        },
      },
    },
    orderBy: { editedAt: "desc" },
  });
  if (!checkDatabaseMessage(databaseMessage)) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.GENERIC_UNEXPECTED_FAILURE,
      "Message check returned falsy like value when it should only return true"
    );
  }

  if (
    !(
      await session.hasBotPermissions(
        InternalPermissions.EDIT_MESSAGES,
        channelId
      )
    ).allPresent
  ) {
    throw new ExpectedPermissionFailure(
      InteractionOrRequestFinalStatus.USER_MISSING_INTERNAL_BOT_PERMISSION,
      missingAccessMessage
    );
  }
  return databaseMessage;
};

interface EditMessageOptions extends CheckEditPossibleOptions {
  content?: string;
  embed?: StoredEmbed;
}

async function editMessage({
  content,
  channelId,
  instance,
  messageId,
  session,
  embed,
}: EditMessageOptions) {
  await checkEditPossible({ channelId, instance, messageId, session });
  try {
    // Check if embed exceeds limits
    if ((content === undefined || content === "") && embed === undefined) {
      throw new ExpectedFailure(
        InteractionOrRequestFinalStatus.ATTEMPTING_TO_SEND_WHEN_NO_CONTENT_SET,
        "No content or embeds have been set, this is required to send a message"
      );
    }
    if (embed !== undefined) {
      const exceedsLimits = checkEmbedMeetsLimits(embed);
      if (exceedsLimits) {
        throw new LimitHit(
          InteractionOrRequestFinalStatus.EMBED_EXCEEDS_DISCORD_LIMITS,
          "The embed exceeds one or more of limits on embeds."
        );
      }

      // Also check if title and / or description is set on the embed
      if (embed.title === undefined && embed.description === undefined) {
        throw new ExpectedFailure(
          InteractionOrRequestFinalStatus.EMBED_REQUIRES_TITLE_OR_DESCRIPTION,
          "The embed requires a title or description."
        );
      }
    }
    const embeds: APIEmbed[] = [];
    if (embed) {
      embeds.push(createSendableEmbedFromStoredEmbed(embed));
    }
    const response = (await instance.restClient.patch(
      Routes.channelMessage(channelId, messageId),
      {
        body: { content: content, embeds },
      }
    )) as RESTPatchAPIChannelMessageResult;
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
    const sentEmbed = createStoredEmbedFromAPIMessage(response);
    let embedQuery:
      | Prisma.MessageEmbedCreateNestedOneWithoutMessageInput
      | undefined = undefined;
    if (sentEmbed !== null) {
      let fieldQuery:
        | Prisma.EmbedFieldCreateNestedManyWithoutEmbedInput
        | undefined;

      if (sentEmbed.fields && sentEmbed.fields.length > 0) {
        fieldQuery = {
          create: sentEmbed.fields.map((field) => ({
            name: field.name,
            value: field.value,
            inline: field.inline,
          })),
        };
      }
      let timestamp: Date | undefined;
      if (sentEmbed.timestamp !== undefined) {
        timestamp = new Date(sentEmbed.timestamp);
      }

      embedQuery = {
        create: {
          title: sentEmbed.title,
          description: sentEmbed.description,
          url: sentEmbed.url,
          timestamp,
          color: sentEmbed.color,
          footerText: sentEmbed.footer?.text,
          footerIconUrl: sentEmbed.footer?.icon_url,
          authorName: sentEmbed.author?.name,
          authorIconUrl: sentEmbed.author?.icon_url,
          authorUrl: sentEmbed.author?.url,
          thumbnailUrl: sentEmbed.thumbnail?.url,
          fields: fieldQuery,
        },
      };
    }

    // Since message will contain message history too
    await instance.prisma.message.create({
      data: {
        id: BigInt(messageId),
        content: response.content,

        editedAt: new Date(Date.now()),
        editedBy: BigInt(session.userId),

        channel: {
          connectOrCreate: {
            where: {
              id: BigInt(channelId),
            },

            create: {
              id: BigInt(channelId),
              guildId: BigInt(session.userId),
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
        embed: embedQuery,
      },
    });
    // Check if message history count hasn't exceeded the limit, if it has then delete the oldest history

    const messageCount = await instance.prisma.message.count({
      where: {
        id: BigInt(messageId),
      },
    });
    if (messageCount > limits.MAX_MESSAGE_HISTORY) {
      const oldestMessage = await instance.prisma.message.findFirst({
        where: {
          id: BigInt(messageId),
        },
        orderBy: {
          editedAt: "asc",
        },
      });
      if (oldestMessage) {
        await instance.prisma.message.delete({
          where: {
            id_editedAt: {
              id: BigInt(messageId),
              editedAt: oldestMessage.editedAt,
            },
          },
        });
      }
    }
    const logEmbed: APIEmbed = {
      color: embedPink,
      title: "Message Edited",
      description:
        `Message (${messageId}) edited` +
        `${
          messageBefore !== null &&
          messageBefore.content !== null &&
          messageBefore.content !== ""
            ? `\n**Original Content:**\n${messageBefore.content}`
            : messageBefore?.content === ""
            ? "\n**Original Content was empty**"
            : ""
        }` +
        `${
          response.content !== undefined &&
          response.content !== null &&
          response.content !== ""
            ? `\n**New Content:**\n${response.content}`
            : response.content === ""
            ? "\n**New Content is empty**"
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
    if (
      sentEmbed !== null &&
      sentEmbed !== undefined &&
      embedBefore !== undefined
    ) {
      files.push({
        name: "embed-before.json",
        data: JSON.stringify(embedBefore, undefined, 2),
      });
      files.push({
        name: "embed-after.json",
        data: JSON.stringify(sentEmbed, undefined, 2),
      });
      logEmbed.description +=
        "\n\nEmbed representation can be found in the attachment.";
    } else if (sentEmbed !== null && sentEmbed !== undefined) {
      files.push({
        name: "embed-after.json",
        data: JSON.stringify(sentEmbed, undefined, 2),
      });
    } else if (embedBefore !== undefined) {
      files.push({
        name: "embed-before.json",
        data: JSON.stringify(embedBefore, undefined, 2),
      });
    }

    // Send log message

    await session.sendLoggingMessage({
      logEmbeds: [logEmbed],
      files: files,
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

export { checkEditPossible, editMessage };
