// Send messages through the bot
import { DiscordAPIError, RawFile } from "@discordjs/rest";
import { Prisma } from "@prisma/client";
import {
  APIEmbed,
  APIMessage,
  ChannelType,
  RESTPostAPIChannelMessageResult,
  Routes,
} from "discord-api-types/v9";
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
import { InternalPermissions } from "../permissions/consts";
import { GuildSession } from "../session";
import {
  requiredPermissionsSendBot,
  requiredPermissionsSendBotThread,
  requiredPermissionsSendUser,
} from "./consts";
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

// Message for missing internal permissions
const missingAccessMessage =
  "You do not have access to the bot permission for sending messages via the bot on this guild. Please contact an administrator.";

// Options interface for functions
interface ThreadOptionObject {
  parentId?: string | null;
  locked?: boolean;
  type:
    | ChannelType.GuildNewsThread
    | ChannelType.GuildPublicThread
    | ChannelType.GuildPrivateThread;
}
interface CheckSendMessageOptions {
  channelId: string;

  instance: FastifyInstance;

  thread?: ThreadOptionObject;
  session: GuildSession;
}

interface SendMessageOptions extends CheckSendMessageOptions {
  content?: string;
  embed?: StoredEmbed;
}

// Checks if the user & the bot have the required permissions to send a message
async function checkSendMessagePossible({
  channelId,
  thread,
  session,
}: CheckSendMessageOptions): Promise<true> {
  // Check if the user has the correct permissions

  const userHasRequiredDiscordPermissions = await session.hasDiscordPermissions(
    requiredPermissionsSendUser,
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
  // Check if the bot has the correct permissions
  const botHasRequiredDiscordPermissions =
    await session.botHasDiscordPermissions(
      // If the target channel is a thread, also required the SEND_MESSAGES_IN_THREADS permission
      thread ? requiredPermissionsSendBotThread : requiredPermissionsSendBot,
      channelId
    );
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

  // Check if the user has the correct internal permissions
  if (
    !(
      await session.hasBotPermissions(
        InternalPermissions.SEND_MESSAGES,
        channelId
      )
    ).allPresent
  ) {
    throw new ExpectedPermissionFailure(
      InteractionOrRequestFinalStatus.USER_MISSING_INTERNAL_BOT_PERMISSION,
      missingAccessMessage
    );
  }

  return true;
}

// send a message
async function sendMessage({
  content,
  embed,
  channelId,

  instance,

  thread,
  session,
}: SendMessageOptions): Promise<APIMessage> {
  await checkSendMessagePossible({
    // Check required permissions
    channelId,

    instance,

    thread,
    session,
  });

  if ((content === undefined || content === "") && embed === undefined) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.ATTEMPTING_TO_SEND_WHEN_NO_CONTENT_SET,
      "No content or embeds have been set, this is required to send a message"
    );
  }
  // Check if embed exceeds limits (limits set by discord)
  if (embed !== undefined) {
    const exceedsLimits = checkEmbedMeetsLimits(embed);
    if (exceedsLimits) {
      throw new LimitHit(
        InteractionOrRequestFinalStatus.EMBED_EXCEEDS_DISCORD_LIMITS,
        "The embed exceeds one or more of limits on embeds."
      );
    }
    if (
      embed?.color !== undefined &&
      (embed.color > 16777215 || embed.color < 0)
    ) {
      throw new ExpectedFailure(
        InteractionOrRequestFinalStatus.EMBED_EXCEEDS_DISCORD_LIMITS,
        "The embed color is not in the range of 0 - 16777215."
      );
    }
    // Also check if title and / or description is set on the embed
    // Also a discord restriction
    if (embed.title === undefined && embed.description === undefined) {
      throw new ExpectedFailure(
        InteractionOrRequestFinalStatus.EMBED_REQUIRES_TITLE_OR_DESCRIPTION,
        "The embed requires a title or description."
      );
    }
  }
  const embeds: APIEmbed[] = [];
  if (embed) {
    // Parse an embed into the form discord expects
    embeds.push(createSendableEmbedFromStoredEmbed(embed));
  }
  try {
    // Send the message to discord
    const messageResult = (await instance.restClient.post(
      Routes.channelMessages(channelId),
      {
        body: { content, embeds },
      }
    )) as RESTPostAPIChannelMessageResult;
    // Save message to database
    const sentEmbed = createStoredEmbedFromAPIMessage(messageResult);
    // Query is the query to provide to the database create method for the embed
    let embedQuery:
      | Prisma.MessageEmbedCreateNestedOneWithoutMessageInput
      | undefined = undefined;

    if (sentEmbed !== null) {
      let fieldQuery:
        | Prisma.EmbedFieldCreateNestedManyWithoutEmbedInput
        | undefined;
      // Generate query for fields
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
      // Generate overall embed query
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

    // Create the message in the database
    await instance.prisma.message.create({
      data: {
        id: BigInt(messageResult.id),
        content: messageResult.content,

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
        embed: embedQuery,
      },
    });
    // generate log embed - if embeds then attach JSON representation of the embeds in a json file
    const logEmbed: APIEmbed = {
      color: embedPink,
      title: "Message Sent",
      description:
        `Message (${messageResult.id}) sent` +
        `${
          messageResult.content !== undefined &&
          messageResult.content !== "" &&
          messageResult.content !== null
            ? `\n**Content:**\n${messageResult.content}`
            : ""
        }`,
      fields: [
        { name: "Action By:", value: `<@${session.userId}>`, inline: true },
        { name: "Channel:", value: `<#${channelId}>`, inline: true },
      ],
      timestamp: new Date().toISOString(),
    };
    const files: RawFile[] = [];
    if (sentEmbed !== null) {
      files.push({
        name: "embed.json",
        data: JSON.stringify(sentEmbed, undefined, 2),
      });
      logEmbed.description +=
        "\n\nEmbed representation can be found in the attachment.";
    }
    // Send log message
    await session.sendLoggingMessage({
      logEmbeds: [logEmbed],
      files: files,
    });
    return messageResult;
  } catch (error) {
    // Catch discord api errors in sending the message
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

export { checkSendMessagePossible, sendMessage, ThreadOptionObject };
