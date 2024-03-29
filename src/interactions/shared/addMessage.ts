// Shared logic for addMessage (migration) command. Shared as it is currently used by both a context menu command
// and a chat input command. This is because there are currently some mobile devices that do not support
// context menu commands
import { Prisma } from "@prisma/client";
import {
  APIApplicationCommandGuildInteraction,
  APIEmbed,
  APIMessage,
  APIMessageApplicationCommandGuildInteraction,
  InteractionResponseType,
  MessageFlags,
  MessageType,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import { embedPink } from "../../constants";
import { ExpectedFailure, InteractionOrRequestFinalStatus } from "../../errors";
import { checkSendMessagePossible } from "../../lib/messages/send";
import { GuildSession } from "../../lib/session";
import { addTipToEmbed } from "../../lib/tips";
import { InteractionReturnData } from "../types";

// Function to add a message
const addMessageLogic = async ({
  message,
  instance,
  interaction,
  session,
}: {
  message: APIMessage;
  instance: FastifyInstance;
  interaction:
    | APIApplicationCommandGuildInteraction
    | APIMessageApplicationCommandGuildInteraction;
  session: GuildSession;
}): Promise<InteractionReturnData> => {
  // Check if the message is valid for migrating
  // First check the date, the data it's checking is the date at which the system was changed
  // This is as any messages after do not need to be migrated
  // And it prevents non-custom messages (i.e. success messages) from being migrated
  if (
    new Date(message.timestamp) > new Date(instance.envVars.NO_MIGRATION_AFTER)
  ) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MIGRATION_ATTEMPTED_ON_MESSAGE_SENT_AFTER_MIGRATION_DATE,
      "Only messages sent before the migration date can be migrated. Any messages sent after the migration date should already be in the database. See `/info message-migration` for more information."
    );
  }
  // Author must be the bot
  if (message.author.id !== instance.envVars.DISCORD_CLIENT_ID) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MESSAGE_AUTHOR_NOT_BOT_AUTHOR,
      "That message was not sent via the bot."
    );
  }
  // Message type must be a normal message - and not from an interaction
  if (message.type !== MessageType.Default || message.interaction) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MIGRATION_ATTEMPTED_ON_NON_STANDARD_MESSAGE,
      "Message must be a normal message (not an interaction response, system message, etc) to be able to be added!"
    );
  }
  // Message must not have been migrated already
  if (
    await instance.prisma.message.findFirst({
      where: { id: BigInt(message.id) },
    })
  ) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MESSAGE_ALREADY_MIGRATED,
      "Message already added to the database. This command is just for migrating messages to the new system."
    );
  }
  // Only allow one embed
  if (message.embeds.length > 1) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MIGRATION_ATTEMPTED_ON_MESSAGE_WITH_MULTIPLE_EMBEDS,
      "Message must have only one embed to be added!"
    );
  }
  const embed: APIEmbed | undefined = message.embeds[0];

  // Check if the user attempting to migrate the message has the correct permissions
  await checkSendMessagePossible({
    channelId: message.channel_id,
    instance,
    session,
  });
  // Generate embed creation query (database)
  let embedQuery:
    | Prisma.MessageEmbedCreateNestedOneWithoutMessageInput
    | undefined = undefined;
  if (embed !== null && embed !== undefined) {
    let fieldQuery:
      | Prisma.EmbedFieldCreateNestedManyWithoutEmbedInput
      | undefined;

    if (embed.fields && embed.fields.length > 0) {
      fieldQuery = {
        create: embed.fields.map((field) => ({
          name: field.name,
          value: field.value,
          inline: field.inline,
        })),
      };
    }
    let timestamp: Date | undefined;
    if (embed.timestamp !== undefined) {
      timestamp = new Date(embed.timestamp);
    }

    embedQuery = {
      create: {
        title: embed.title,
        description: embed.description,
        url: embed.url,
        timestamp,
        color: embed.color,
        footerText: embed.footer?.text,
        footerIconUrl: embed.footer?.icon_url,
        authorName: embed.author?.name,
        authorIconUrl: embed.author?.icon_url,
        authorUrl: embed.author?.url,
        thumbnailUrl: embed.thumbnail?.url,
        fields: fieldQuery,
      },
    };
  }

  // Add the message to the database
  await instance.prisma.message.create({
    data: {
      id: BigInt(message.id),
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
      embed: embedQuery,
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
          description: `Message added! You can now perform all usual actions on this [message](${messageLink}).`,
          timestamp: new Date().toISOString(),
          url: messageLink,
        }),
      ],
    },
  };
};

export { addMessageLogic };
