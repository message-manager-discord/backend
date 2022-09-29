// Responds with the "raw" format for certain discord object, as the modals do not contain
// a WYSIWYG editor
import {
  APIApplicationCommandInteractionDataChannelOption,
  APIApplicationCommandInteractionDataRoleOption,
  APIApplicationCommandInteractionDataSubcommandOption,
  APIApplicationCommandInteractionDataUserOption,
  APIChatInputApplicationCommandGuildInteraction,
  ApplicationCommandOptionType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";

import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../../errors";
import { InternalInteractionType } from "../../interaction";
import { InteractionReturnData } from "../../types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function handleRawFormatCommand(
  internalInteraction: InternalInteractionType<APIChatInputApplicationCommandGuildInteraction>
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  const subcommand = interaction.data.options?.[0];
  if (
    !subcommand ||
    subcommand.type !== ApplicationCommandOptionType.Subcommand
  ) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_MISSING_EXPECTED_OPTION,
      "Missing subcommand"
    );
  }
  // Subcommands - so sent them off to different handlers
  switch (subcommand.name) {
    case "user":
      return handleRawFormatUserSubcommand(internalInteraction, subcommand);

    case "role":
      return handleRawFormatRoleSubcommand(internalInteraction, subcommand);

    case "channel":
      return handleRawFormatChannelSubcommand(internalInteraction, subcommand);

    default:
      throw new UnexpectedFailure(
        InteractionOrRequestFinalStatus.APPLICATION_COMMAND_UNEXPECTED_SUBCOMMAND,
        `Invalid subcommand: \`${subcommand.name}\``
      );
  }
}

function handleRawFormatUserSubcommand(
  internalInteraction: InternalInteractionType<APIChatInputApplicationCommandGuildInteraction>,
  subcommand: APIApplicationCommandInteractionDataSubcommandOption
): InteractionReturnData {
  const targetId: string | undefined = (
    subcommand.options?.find(
      (option) =>
        option.name === "user" &&
        option.type === ApplicationCommandOptionType.User
    ) as APIApplicationCommandInteractionDataUserOption | undefined
  )?.value;
  if (targetId === undefined) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_MISSING_EXPECTED_OPTION,
      "Missing target option"
    );
  }

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: `\`<@${targetId}>\``,
      flags: MessageFlags.Ephemeral,
    },
  };
}
function handleRawFormatRoleSubcommand(
  internalInteraction: InternalInteractionType<APIChatInputApplicationCommandGuildInteraction>,
  subcommand: APIApplicationCommandInteractionDataSubcommandOption
): InteractionReturnData {
  const targetId: string | undefined = (
    subcommand.options?.find(
      (option) =>
        option.name === "role" &&
        option.type === ApplicationCommandOptionType.Role
    ) as APIApplicationCommandInteractionDataRoleOption | undefined
  )?.value;
  if (targetId === undefined) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_MISSING_EXPECTED_OPTION,
      "Missing target option"
    );
  }

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: `\`<@&${targetId}>\``,
      flags: MessageFlags.Ephemeral,
    },
  };
}

function handleRawFormatChannelSubcommand(
  internalInteraction: InternalInteractionType<APIChatInputApplicationCommandGuildInteraction>,
  subcommand: APIApplicationCommandInteractionDataSubcommandOption
): InteractionReturnData {
  const targetId: string | undefined = (
    subcommand.options?.find(
      (option) =>
        option.name === "channel" &&
        option.type === ApplicationCommandOptionType.Channel
    ) as APIApplicationCommandInteractionDataChannelOption | undefined
  )?.value;
  if (targetId === undefined) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_MISSING_EXPECTED_OPTION,
      "Missing target option"
    );
  }
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: `\`<#${targetId}>\``,
      flags: MessageFlags.Ephemeral,
    },
  };
}
