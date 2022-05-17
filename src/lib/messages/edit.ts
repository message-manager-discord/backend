import { Message } from "@prisma/client";
import { DiscordHTTPError } from "detritus-client-rest/lib/errors";
import { APIEmbed, Snowflake } from "discord-api-types/v9";
import { RESTPatchAPIChannelMessageResult } from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import { embedPink } from "../../constants";
import { parseDiscordPermissionValuesToStringNames } from "../../consts";
import {
  ExpectedPermissionFailure,
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors";
import limits from "../../limits";
import { InternalPermissions } from "../permissions/consts";
import { GuildSession } from "../session";
import { checkDatabaseMessage } from "./checks";
import { requiredPermissionsEdit } from "./consts";
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
}: CheckEditPossibleOptions): Promise<Message> => {
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
  content: string;
}

async function editMessage({
  content,
  channelId,
  instance,
  messageId,
  session,
}: EditMessageOptions) {
  await checkEditPossible({ channelId, instance, messageId, session });
  try {
    const response = (await instance.restClient.editMessage(
      channelId,
      messageId,
      {
        content: content,
      }
    )) as RESTPatchAPIChannelMessageResult;
    const messageBefore = await instance.prisma.message.findFirst({
      where: { id: BigInt(messageId) },
      orderBy: { editedAt: "desc" },
    });

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
    const embed: APIEmbed = {
      color: embedPink,
      title: "Message Edited",
      description:
        `Message (${messageId}) edited` +
        `\n**Original Content:**\n${
          messageBefore?.content ?? "" //This should never be null as the message is being edited
        }` +
        `\n**New Content:**\n${response.content}`,
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

export { checkEditPossible, editMessage };
