import { Message } from "@prisma/client";
import { APIMessage, Snowflake } from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import { ExpectedFailure, InteractionOrRequestFinalStatus } from "../../errors";
import { registerAddCommand } from "../applicationCommands/registerHelper";
import { InternalPermissions } from "../permissions/consts";
import { GuildSession } from "../session";
import { requiredPermissionsEdit } from "./consts";

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
  if (!databaseMessage) {
    const guild = await instance.prisma.guild.findUnique({
      where: { id: BigInt(session.guildId) },
    });
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

async function getMessageActionsPossible({
  message,
  instance,
  session,
}: GetMessageActionsPossibleOptions): Promise<GetMessageActionsPossibleResult> {
  // The bot does not require any permissions to report a message, but bot permissions of VIEW_CHANNEL are required to edit or delete a message
  // The user must have the VIEW_CHANNEL permission

  const databaseMessage = await instance.prisma.message.findFirst({
    where: { id: BigInt(message.id) },
    // Don't need to worry about ordering as all we want to do is check that this message has been sent by the bot before
  });

  await checkIfMessageExistsAndHandleAdding({
    instance,
    session,
    message,
    databaseMessage,
  });

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
