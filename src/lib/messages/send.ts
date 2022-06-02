import { DiscordHTTPError } from "detritus-client-rest/lib/errors";
import {
  APIEmbed,
  APIMessage,
  ChannelType,
  RESTPostAPIChannelMessageResult,
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
import {
  requiredPermissionsSendBot,
  requiredPermissionsSendBotThread,
  requiredPermissionsSendUser,
} from "./consts";
import {
  missingBotDiscordPermissionMessage,
  missingUserDiscordPermissionMessage,
} from "./utils";

const missingAccessMessage =
  "You do not have access to the bot permission for sending messages via the bot on this guild. Please contact an administrator.";

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
  content: string;
}

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

async function sendMessage({
  content,
  channelId,

  instance,

  thread,
  session,
}: SendMessageOptions): Promise<APIMessage> {
  await checkSendMessagePossible({
    channelId,

    instance,

    thread,
    session,
  });
  try {
    const messageResult = (await instance.restClient.createMessage(channelId, {
      content,
    })) as RESTPostAPIChannelMessageResult;
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
      },
    });
    const embed: APIEmbed = {
      color: embedPink,
      title: "Message Sent",
      description:
        `Message (${messageResult.id}) sent` +
        `\n**Content:**\n${messageResult.content}`,
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
    return messageResult;
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

export { checkSendMessagePossible, sendMessage, ThreadOptionObject };
