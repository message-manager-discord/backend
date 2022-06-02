import {
  APIMessage,
  APIMessageApplicationCommandGuildInteraction,
  InteractionResponseType,
  MessageFlags,
  MessageType,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import { embedPink } from "../../../constants";
import {
  ExpectedFailure,
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../../errors";
import { checkSendMessagePossible } from "../../../lib/messages/send";
import { GuildSession } from "../../../lib/session";
import { addTipToEmbed } from "../../../lib/tips";
import { InternalInteractionType } from "../../interaction";
import { InteractionReturnData } from "../../types";

export default async function handleAddMessageCommand(
  internalInteraction: InternalInteractionType<APIMessageApplicationCommandGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  // This command will generate a ephemeral message with the action buttons for editing, deleting, or reporting.
  // The command will also check permissions for the invoking user

  const interaction = internalInteraction.interaction;
  const messageId = interaction.data.target_id;
  const message = interaction.data.resolved.messages[messageId] as
    | APIMessage
    | undefined;
  if (message === undefined) {
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
  if (message.type !== MessageType.Default || message.interaction) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MIGRATION_ATTEMPTED_ON_NON_STANDARD_MESSAGE,
      "Message must be a normal message (not an interaction response, system message, etc) to be able to be added!"
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
    instance,
    session,
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

  const messageLink = `https://discord.com/channels/${interaction.guild_id}/${message.channel_id}/${message.id}`;

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      flags: MessageFlags.Ephemeral,
      embeds: [
        addTipToEmbed({
          title: "Message Added",
          color: embedPink,
          description: `Message added! You can now perform all usual actions on that [message](${messageLink}).`,
          timestamp: new Date().toISOString(),
          url: messageLink,
        }),
      ],
    },
  };
}
