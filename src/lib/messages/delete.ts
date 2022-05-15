import { Message } from "@prisma/client";
import { DiscordHTTPError } from "detritus-client-rest/lib/errors";
import { APIEmbed, Snowflake } from "discord-api-types/v9";

import { FastifyInstance } from "fastify";
import {
  InteractionOrRequestFinalStatus,
  ExpectedPermissionFailure,
  UnexpectedFailure,
} from "../../errors";

import {
  missingBotDiscordPermissionMessage,
  missingUserDiscordPermissionMessage,
} from "./utils";
import { embedPink } from "../../constants";
import { GuildSession } from "../session";
import { requiredPermissionsDelete } from "./consts";
import { checkDatabaseMessage } from "./checks";
import { InternalPermissions } from "../permissions/consts";
import { parseDiscordPermissionValuesToStringNames } from "../../consts";

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
}: DeleteOptions): Promise<Message> => {
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
    await instance.restClient.deleteMessage(channelId, messageId);
    const messageBefore = (await instance.prisma.message.findFirst({
      where: { id: BigInt(messageId) },

      orderBy: { editedAt: "desc" },
    })) as Message;
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
    const embed: APIEmbed = {
      color: embedPink,
      title: "Message Deleted",
      description:
        `Message (${messageId}) deleted` +
        `\n\n**Message Content:**\n${messageBefore.content}`,
      fields: [
        { name: "Action By:", value: `<@${session.userId}>`, inline: true },
        { name: "Channel:", value: `<#${channelId}>`, inline: true },
      ],
      timestamp: new Date().toISOString(),
    };
    // Send log message
    await instance.loggingManager.sendLogMessage({
      guildId: session.guildId,
      embeds: [embed],
    });
  } catch (error) {
    if (error instanceof DiscordHTTPError) {
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
