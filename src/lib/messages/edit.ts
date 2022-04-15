import { Message } from "@prisma/client";
import { DiscordHTTPError } from "detritus-client-rest/lib/errors";
import {
  APIEmbed,
  APIInteractionGuildMember,
  Snowflake,
} from "discord-api-types/v9";
import { RESTPatchAPIChannelMessageResult } from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import {
  InteractionOrRequestFinalStatus,
  ExpectedPermissionFailure,
  UnexpectedFailure,
} from "../../errors";
import { checkDefaultDiscordPermissionsPresent } from "../permissions/discordChecks";
import {
  checkAllPermissions,
  Permission,
  PermissionsData,
} from "../permissions/checks";
import { checkDatabaseMessage } from "./utils";
import { embedPink } from "../../constants";
import limits from "../../limits";

interface CheckEditPossibleOptions {
  user: APIInteractionGuildMember;
  guildId: Snowflake;
  channelId: Snowflake;
  messageId: Snowflake;
  instance: FastifyInstance;
}

const missingAccessMessage =
  "You do not have access to the bot permission for editing messages via the bot on this guild. Please contact an administrator.";

const checkEditPossible = async ({
  user,
  guildId,
  channelId,
  instance,
  messageId,
}: CheckEditPossibleOptions): Promise<Message> => {
  const { idOrParentId } = await checkDefaultDiscordPermissionsPresent({
    instance,
    user,
    guildId,
    channelId,
  });
  const databaseMessage = await instance.prisma.message.findFirst({
    where: { id: BigInt(messageId) },
    orderBy: { editedAt: "desc" },
  });
  if (!checkDatabaseMessage(databaseMessage)) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.GENERIC_UNEXPECTED_FAILURE,
      "Message check returned falsy like value"
    );
    //
  }

  const guild = await instance.prisma.guild.findUnique({
    where: { id: BigInt(guildId) },
    select: { permissions: true },
  });
  const databaseChannel = await instance.prisma.channel.findUnique({
    where: { id: BigInt(idOrParentId) },
    select: { permissions: true },
  });
  if (
    !checkAllPermissions({
      roles: user.roles,
      userId: user.user.id,
      guildPermissions: guild?.permissions as unknown as
        | PermissionsData
        | undefined,
      channelPermissions: databaseChannel?.permissions as unknown as
        | PermissionsData
        | undefined,
      permission: Permission.EDIT_MESSAGES,
    })
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
  guildId,
  instance,
  user,
  messageId,
}: EditMessageOptions) {
  await checkEditPossible({ user, guildId, channelId, instance, messageId });
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
        editedBy: BigInt(user.user.id),

        channel: {
          connectOrCreate: {
            where: {
              id: BigInt(channelId),
            },

            create: {
              id: BigInt(channelId),
              guildId: BigInt(guildId),
            },
          },
        },
        guild: {
          connectOrCreate: {
            where: {
              id: BigInt(guildId),
            },

            create: {
              id: BigInt(guildId),
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
          messageBefore?.content || "" //This should never be null as the message is being edited
        }` +
        `\n**New Content:**\n${response.content}`,
      fields: [
        { name: "Action By:", value: `<@${user.user.id}>`, inline: true },
        { name: "Channel:", value: `<#${channelId}>`, inline: true },
      ],
    };
    // Send log message
    await instance.loggingManager.sendLogMessage({
      guildId: guildId,
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
