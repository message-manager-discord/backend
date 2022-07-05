import { DiscordAPIError } from "@discordjs/rest";
import {
  APIApplicationCommandInteractionDataStringOption,
  APIChatInputApplicationCommandGuildInteraction,
  ApplicationCommandOptionType,
  RESTGetAPIChannelMessageResult,
  Routes,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import {
  ExpectedFailure,
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../../errors";
import { GuildSession } from "../../../lib/session";
import { InternalInteractionType } from "../../interaction";
import { addMessageLogic } from "../../shared/addMessage";
import { InteractionReturnData } from "../../types";

export default async function handleAddMessageCommand(
  internalInteraction: InternalInteractionType<APIChatInputApplicationCommandGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  // First option: Message Id
  const messageId: string | undefined = (
    interaction.data.options?.find(
      (option) =>
        option.name === "message-id" &&
        option.type === ApplicationCommandOptionType.String
    ) as APIApplicationCommandInteractionDataStringOption
  )?.value;
  if (!messageId) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_MISSING_EXPECTED_OPTION,
      "No message id option on add message command"
    );
  }
  // Fetch message from api
  try {
    const message = (await instance.restClient.get(
      Routes.channelMessage(interaction.channel_id, messageId)
    )) as RESTGetAPIChannelMessageResult;
    return await addMessageLogic({
      instance,
      interaction,
      message,
      session,
    });
  } catch (error) {
    if (!(error instanceof DiscordAPIError)) {
      throw error;
    }
    // Handle forbidden and not found, with separate messages
    if (error.status === 403) {
      throw new ExpectedFailure(
        InteractionOrRequestFinalStatus.BOT_MISSING_DISCORD_PERMISSION,
        "The bot is missing the discord permissions to access that message"
      );
    } else if (error.status === 404) {
      throw new ExpectedFailure(
        InteractionOrRequestFinalStatus.MESSAGE_NOT_FOUND_DISCORD_DELETED_OR_NOT_EXIST,
        "That message could not be found, make sure you are using the command in the same channel as the message"
      );
    }
    throw error;
  }
}
