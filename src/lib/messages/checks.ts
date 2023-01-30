// Various checks for message actions
import { Message } from "@prisma/client";
import { APIMessage, Snowflake } from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import { ExpectedFailure, InteractionOrRequestFinalStatus } from "../../errors";
import { registerAddCommand } from "../applicationCommands/registerHelper";
import { InternalPermissions } from "../permissions/consts";
import { GuildSession } from "../session";
import { requiredPermissionsEdit } from "./consts";

// Some options for functions
interface GetMessageActionsPossibleOptions {
  message: APIMessage;
  instance: FastifyInstance;
  guildId: Snowflake;
  session: GuildSession;
}

interface GetMessageActionsPossibleResult {
  view: boolean;
  edit: boolean;
  delete: boolean;
}

// Check if the message exists, and if it does not, present the migration options to the user
async function checkIfMessageExistsAndHandleAdding({
  instance,
  session,
  message,
  databaseMessage,
}: {
  instance: FastifyInstance;
  session: GuildSession;
  message: APIMessage;
  databaseMessage: Message | null;
}) {
  // Check if the message is not null, and if it is not, then add an add message context menu (if it doesn't already exist)
  // if the guild and message meets the requirements for migration
  if (!databaseMessage) {
    const guild = await instance.prisma.guild.findUnique({
      where: { id: BigInt(session.guildId) },
    });

    // Check if guild eligible for migration
    if (
      (guild?.beforeMigration ?? false) &&
      message.author.id === instance.envVars.DISCORD_CLIENT_ID
    ) {
      // If guild has not had command registered, register it
      if (
        !(await instance.redisCache.getGuildMigrationCommandRegistered(
          session.guildId
        ))
      ) {
        await registerAddCommand(session.guildId, instance);
        // Check if the user has the required permissions to add a message (SEND_MESSAGES)
        // If they do not tell them to ask someone who does to add the message
        const userHasSendMessagePermission = await session.hasBotPermissions(
          InternalPermissions.SEND_MESSAGES,
          message.channel_id
        );
        throw new ExpectedFailure(
          InteractionOrRequestFinalStatus.MESSAGE_NOT_FOUND_IN_DATABASE_MIGRATION_POSSIBLE,
          `That message was not sent via the bot! ${
            userHasSendMessagePermission.allPresent
              ? 'Try using the "Add Message" context menu command or the `/add-message` slash command'
              : "Ask someone who has the send messages bot permission to add this message"
          } (for more info check out \`/info migration\`)`
        );
      }
    }
    // If migration not eligible - or message not sent by bot, throw error
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MESSAGE_NOT_FOUND_IN_DATABASE,
      "That message was not sent via the bot!"
    );
  }
}

const checkDatabaseMessage = (message: Message | null): message is Message => {
  // This checks if the message exists, and if it does not throws errors
  // It differs from checkIfMessageExistsAndHandleAdding in that that function requires the message to have existed on discord when the command was sent
  if (!message) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MESSAGE_NOT_FOUND_IN_DATABASE,
      "That message was not sent via the bot!"
    );
  }
  if (message.deleted) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MESSAGE_DELETED_DURING_ACTION,
      "That message was deleted during this action. Please dismiss all related messages."
    );
  }
  return true;
};

// Gets the possible actions for a message - for that user
async function getMessageActionsPossible({
  message,
  instance,
  session,
}: GetMessageActionsPossibleOptions): Promise<GetMessageActionsPossibleResult> {
  // The bot does not require any permissions to report a message, but bot permissions of VIEW_CHANNEL are required to edit or delete a message
  // The user must have the VIEW_CHANNEL permission

  const databaseMessage = await instance.prisma.message.findFirst({
    where: { id: BigInt(message.id) },
    orderBy: { id: "desc" },
  });

  // Check if it exists and is valid (ie by the bot)
  await checkIfMessageExistsAndHandleAdding({
    instance,
    session,
    message,
    databaseMessage,
  });

  // None of these below functions will throw - they'll just be used to display different options to the user

  // Check bot and user discord permissions
  const botHasViewChannel = (
    await session.botHasDiscordPermissions(
      requiredPermissionsEdit,
      message.channel_id
    )
  ).allPresent;
  const userHasViewChannel = (
    await session.hasDiscordPermissions(
      requiredPermissionsEdit,
      message.channel_id
    )
  ).allPresent;
  const botAndUserHaveViewChannel = botHasViewChannel && userHasViewChannel;

  // Check user internal permissions
  const hasEdit = (
    await session.hasBotPermissions(
      InternalPermissions.EDIT_MESSAGES,
      message.channel_id
    )
  ).allPresent;
  const hasDelete = (
    await session.hasBotPermissions(
      InternalPermissions.DELETE_MESSAGES,
      message.channel_id
    )
  ).allPresent;

  // Return the possible actions
  return {
    edit: hasEdit && botAndUserHaveViewChannel,
    delete: hasDelete && botAndUserHaveViewChannel,
    view: botAndUserHaveViewChannel,
  };
}
export {
  checkDatabaseMessage,
  checkIfMessageExistsAndHandleAdding,
  getMessageActionsPossible,
};
