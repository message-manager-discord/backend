import {
  APIMessageApplicationCommandGuildInteraction,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
  ExpectedFailure,
} from "../../../errors";
import { checkSendMessagePossible } from "../../../lib/messages/send";
import { InternalInteraction } from "../../interaction";
import { InteractionReturnData } from "../../types";

export default async function handleAddMessageCommand(
  internalInteraction: InternalInteraction<APIMessageApplicationCommandGuildInteraction>,
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  // This command will generate a ephemeral message with the action buttons for editing, deleting, or reporting.
  // The command will also check permissions for the invoking user

  const interaction = internalInteraction.interaction;
  const messageId = interaction.data.target_id;
  const message = interaction.data.resolved.messages[messageId];
  if (!message) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_RESOLVED_MISSING_EXPECTED_VALUE,
      "Message not found in resolved data"
    );
  }

  if (
    new Date(message.timestamp) > new Date(instance.envVars.NO_MIGRATION_AFTER)
  ) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MIGRATION_ATTEMPTED_ON_MESSAGE_SENT_AFTER_MIGRATION_DATE,
      "Only messages sent before the migration date can be migrated. Any messages sent after the migration date should already be in the database. See `/info message-migration` for more information."
    );
  }
  if (message.author.id !== instance.envVars.DISCORD_CLIENT_ID) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MESSAGE_AUTHOR_NOT_BOT_AUTHOR,
      "That message was not sent via the bot."
    );
  }
  if (
    await instance.prisma.message.findFirst({
      where: { id: BigInt(messageId) },
    })
  ) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MESSAGE_ALREADY_MIGRATED,
      "Message already added to the database. This command is just for migrating messages to the new system."
    );
  }

  await checkSendMessagePossible({
    channelId: message.channel_id,
    guildId: interaction.guild_id,
    instance,
    user: interaction.member,
  });
  // User should be able to send messages in the channel to add the message
  // Add the message to the database
  await instance.prisma.message.create({
    data: {
      id: BigInt(messageId),
      content: message.content,

      editedAt: new Date(Date.now()),
      editedBy: BigInt(interaction.member.user.id),
      addedByUser: true,
      channel: {
        connectOrCreate: {
          where: {
            id: BigInt(interaction.channel_id),
          },

          create: {
            id: BigInt(interaction.channel_id),
            guildId: BigInt(interaction.guild_id),
          },
        },
      },
      guild: {
        connectOrCreate: {
          where: {
            id: BigInt(interaction.guild_id),
          },

          create: {
            id: BigInt(interaction.guild_id),
          },
        },
      },
    },
  });

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      flags: MessageFlags.Ephemeral,
      content:
        `Click on the below buttons to edit, delete, or report [this message](https://discord.com/channels/${interaction.guild_id}/${message.channel_id}/${message.id})` +
        `\nIf the action is not available, you may be missing the required permissions for that action.`,
    },
  };
}
