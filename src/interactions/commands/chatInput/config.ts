import {
  APIApplicationCommandInteractionDataChannelOption,
  APIApplicationCommandInteractionDataMentionableOption,
  APIApplicationCommandInteractionDataSubcommandGroupOption,
  APIApplicationCommandInteractionDataSubcommandOption,
  APIChatInputApplicationCommandGuildInteraction,
  APIEmbed,
  APIInteractionDataResolvedChannel,
  APIInteractionResponseChannelMessageWithSource,
  ApplicationCommandOptionType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { Snowflake } from "discord-api-types/globals";
import { FastifyInstance } from "fastify";
import {
  ExpectedFailure,
  ExpectedPermissionFailure,
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../../errors";

import { embedPink } from "../../../constants";

import { InteractionReturnData } from "../../types";

import { addTipToEmbed } from "../../../lib/tips";
import { InternalInteractionType } from "../../interaction";
import { GuildSession } from "../../../lib/session";
import { InternalPermissions } from "../../../lib/permissions/consts";
import createPermissionsEmbed from "../../shared/permissions-config";
import { checkIfRoleIsBelowUsersHighestRole } from "../../../lib/permissions/checks";

export default async function handleConfigCommand(
  internalInteraction: InternalInteractionType<APIChatInputApplicationCommandGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  const subcommand = interaction.data.options?.[0];
  if (
    !subcommand ||
    subcommand.type !== ApplicationCommandOptionType.SubcommandGroup
  ) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_MISSING_EXPECTED_OPTION,
      "Missing subcommand"
    );
  }
  switch (subcommand.name) {
    case "permissions":
      return await handlePermissionsSubcommand(
        internalInteraction,
        subcommand,
        instance,
        session
      );

    case "logging-channel":
      return await handleLoggingChannelSubcommandGroup(
        internalInteraction,
        subcommand,
        instance,
        session
      );

    default:
      throw new UnexpectedFailure(
        InteractionOrRequestFinalStatus.APPLICATION_COMMAND_UNEXPECTED_SUBCOMMAND,
        `Invalid subcommand: \`${subcommand.name}\``
      );
  }
}

async function handlePermissionsSubcommand(
  internalInteraction: InternalInteractionType<APIChatInputApplicationCommandGuildInteraction>,
  subcommandGroup: APIApplicationCommandInteractionDataSubcommandGroupOption,
  instance: FastifyInstance,
  session: GuildSession
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  const subcommand = subcommandGroup.options[0];
  const channelId: string | undefined = (
    subcommand.options?.find(
      (option) =>
        option.name === "channel" &&
        option.type === ApplicationCommandOptionType.Channel
    ) as APIApplicationCommandInteractionDataChannelOption
  )?.value;
  const channel = interaction.data.resolved?.channels?.[channelId]; // Channel is found here because it is found for all subcommands

  switch (subcommand.name) {
    case "list":
      return await handlePermissionsListSubcommand({
        instance,
        channel,
        subcommand,
        session,
      });

    case "manage":
      return await handlePermissionsManageSubcommand({
        internalInteraction,
        instance,
        channel,
        subcommand,
        session,
      });

    default:
      throw new UnexpectedFailure(
        InteractionOrRequestFinalStatus.APPLICATION_COMMAND_UNEXPECTED_SUBCOMMAND,
        `Invalid subcommand: \`${subcommand.name}\``
      );
  }
}

async function handlePermissionsListSubcommand({
  instance,
  channel,
  session,
}: {
  instance: FastifyInstance;
  channel?: APIInteractionDataResolvedChannel;

  subcommand: APIApplicationCommandInteractionDataSubcommandOption;
  session: GuildSession;
}): Promise<APIInteractionResponseChannelMessageWithSource> {
  // The presence of `channel` indicates if the subcommand is for the guild level (absence) or channel level
  // Guild: Lists all users and role with permissions set on the guild, and all channels with permissions set
  // Channel: Lists all users and role with permissions set on the channel
  let description: string;
  let entitiesWithPermissions: { users: Snowflake[]; roles: Snowflake[] };
  if (channel) {
    description = `Users and roles with permissions on ${channel.name}`;
    entitiesWithPermissions =
      await instance.permissionManager.getChannelEntitiesWithPermissions(
        channel.id
      );
  } else {
    description = `Users and roles with permissions`;
    entitiesWithPermissions =
      await instance.permissionManager.getEntitiesWithPermissions(
        session.guildId
      );
  }
  description +=
    `\n**Roles**: ${
      entitiesWithPermissions.roles.length > 0
        ? "<@&" + entitiesWithPermissions.roles.join(">, <@&") + ">"
        : "None"
    }` +
    `\n**Users**: ${
      entitiesWithPermissions.users.length > 0
        ? "<@" + entitiesWithPermissions.users.join(">, <@") + ">"
        : "None"
    }`;
  let extraDescription = "";
  if (!channel) {
    // Guild level so show some extra tips
    const channelsWithPermissions =
      await instance.permissionManager.getChannelsWithPermissions(
        session.guildId
      );
    if (channelsWithPermissions.length > 0) {
      extraDescription += `\n\n**Channels with permissions:** <#${channelsWithPermissions.join(
        ">, <#"
      )}>`;
    }
    extraDescription +=
      "\n*To view permissions on a channel level pass the channel option on this command*";
  }
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [
        addTipToEmbed({
          title: `Permissions for ${channel ? "#" + channel.name : "guild"}`,
          description: description + extraDescription,
          color: embedPink,
        }),
      ],
      flags: MessageFlags.Ephemeral,
    },
  };
}

async function handlePermissionsManageSubcommand({
  internalInteraction,
  instance,
  channel,
  subcommand,
  session,
}: {
  internalInteraction: InternalInteractionType<APIChatInputApplicationCommandGuildInteraction>;
  instance: FastifyInstance;
  channel?: APIInteractionDataResolvedChannel;

  subcommand: APIApplicationCommandInteractionDataSubcommandOption;
  session: GuildSession;
}): Promise<APIInteractionResponseChannelMessageWithSource> {
  const interaction = internalInteraction.interaction;
  const targetId: string | undefined = (
    subcommand.options?.find(
      (option) =>
        option.name === "target" &&
        option.type === ApplicationCommandOptionType.Mentionable
    ) as APIApplicationCommandInteractionDataMentionableOption | undefined
  )?.value;
  if (targetId === undefined) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_MISSING_EXPECTED_OPTION,
      "Missing target option"
    );
  }

  const resolvedData = interaction.data.resolved;
  let targetType: "role" | "user";

  if (resolvedData?.roles && resolvedData.roles[targetId] !== undefined) {
    targetType = "role";
  } else if (
    resolvedData?.members &&
    resolvedData.members[targetId] !== undefined &&
    resolvedData.users &&
    resolvedData.users[targetId] !== undefined
  ) {
    targetType = "user";
    const targetUser = resolvedData.users[targetId];
    if (targetUser.bot ?? false) {
      throw new ExpectedFailure(
        InteractionOrRequestFinalStatus.BOT_FOUND_WHEN_USER_EXPECTED,
        "The target cannot be a bot"
      );
    }
  } else {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_RESOLVED_MISSING_EXPECTED_VALUE,
      "Target not found in resolved data"
    );
  }
  // Permissions are checked here, just so that users cannot view a settings config that they cannot then change
  if (
    !(
      await session.hasBotPermissions(
        InternalPermissions.MANAGE_PERMISSIONS,
        undefined
      )
    ).allPresent
  ) {
    throw new ExpectedPermissionFailure(
      InteractionOrRequestFinalStatus.USER_MISSING_INTERNAL_BOT_PERMISSION,
      "You need the MANAGE_PERMISSIONS permission to manage permissions"
    );
  }
  if (targetType === "role") {
    if (
      !(await checkIfRoleIsBelowUsersHighestRole({
        session,
        roleId: targetId,
      }))
    ) {
      throw new ExpectedPermissionFailure(
        InteractionOrRequestFinalStatus.USER_ROLES_NOT_HIGH_ENOUGH,
        "The role you are trying to manage permissions for is not below your highest role"
      );
    }
  }

  // Not deferred as no logic is 'heavy'

  const permissionReturnData = await createPermissionsEmbed({
    targetType,
    targetId,
    channelId: channel?.id ?? null,
    session,
    instance,
    first: true,
  });
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [permissionReturnData.embed],
      components: permissionReturnData.components,
      flags: MessageFlags.Ephemeral,
    },
  };
}
async function handleLoggingChannelSubcommandGroup(
  internalInteraction: InternalInteractionType<APIChatInputApplicationCommandGuildInteraction>,
  subcommandGroup: APIApplicationCommandInteractionDataSubcommandGroupOption,
  instance: FastifyInstance,
  session: GuildSession
): Promise<InteractionReturnData> {
  const subcommand = subcommandGroup.options[0];

  switch (subcommand.name) {
    case "set":
      return await handleLoggingChannelSetSubcommand({
        internalInteraction,
        subcommand,
        instance,
        session,
      });

    case "remove":
      return await handleLoggingChannelRemoveSubcommand({
        internalInteraction,
        instance,
        session,
      });

    case "get":
      return await handleLoggingChannelGetSubcommand({
        internalInteraction,
        instance,
      });

    default:
      throw new UnexpectedFailure(
        InteractionOrRequestFinalStatus.APPLICATION_COMMAND_UNEXPECTED_SUBCOMMAND,
        `Invalid subcommand: \`${subcommand.name}\``
      );
  }
}

async function handleLoggingChannelSetSubcommand({
  internalInteraction,
  subcommand,
  instance,
  session,
}: {
  internalInteraction: InternalInteractionType<APIChatInputApplicationCommandGuildInteraction>;
  subcommand: APIApplicationCommandInteractionDataSubcommandOption;
  instance: FastifyInstance;
  session: GuildSession;
}): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;

  const channelId = (
    subcommand.options?.find(
      (option) =>
        option.type === ApplicationCommandOptionType.Channel &&
        option.name === "channel"
    ) as APIApplicationCommandInteractionDataChannelOption | undefined
  )?.value;
  if (channelId === undefined) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_MISSING_EXPECTED_OPTION,
      "Missing channel option"
    );
  }
  // Webhook permissions are not checked here for the bot, since they are checked before setting the logging channel
  // This allows the logging channel to be set to a channel the bot has already created a webhook in, even if it does not currently have
  // the required permissions to create a webhook
  const previousChannelId =
    await instance.loggingManager.setGuildLoggingChannel(channelId, session);

  let description: string;
  let title: string;
  if (previousChannelId === channelId) {
    description = `Logging channel not changed`;
    title = "Logging channel not changed";
  } else if (previousChannelId !== null) {
    description = `Logging channel set to <#${channelId}> from <#${previousChannelId}>`;
    title = "Logging channel updated";
  } else if (channelId) {
    description = `Logging channel set to <#${channelId}>`;
    title = "Logging channel set";
  } else {
    description = `Logging channel not changed`;
    title = "Logging channel not changed";
  }
  const embed: APIEmbed = {
    title,
    color: embedPink,
    timestamp: new Date().toISOString(),
    description,
  };
  const logEmbed = { ...embed }; // make a copy not another reference
  logEmbed.fields = [
    {
      name: "Action By:",
      value: `<@${session.userId}>`,
    },
  ];
  if (previousChannelId !== channelId) {
    // Should not send a log if not changed
    await instance.loggingManager.sendLogMessage({
      guildId: interaction.guild_id,
      embeds: [logEmbed],
      ignoreErrors: false,
    });
  }
  // If this fails it will be returned to the user
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [addTipToEmbed(embed)],
      flags: MessageFlags.Ephemeral,
    },
  };
}

async function handleLoggingChannelRemoveSubcommand({
  internalInteraction,
  instance,
  session,
}: {
  internalInteraction: InternalInteractionType<APIChatInputApplicationCommandGuildInteraction>;
  instance: FastifyInstance;
  session: GuildSession;
}): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;

  // Webhook permissions are not checked here for the bot, since they are checked before setting the logging channel
  // This allows the logging channel to be set to a channel the bot has already created a webhook in, even if it does not currently have
  // the required permissions to create a webhook
  const previousChannelId =
    await instance.loggingManager.removeGuildLoggingChannel(session);

  let description: string;
  let title: string;
  if (previousChannelId === null) {
    description = `Logging channel not changed`;
    title = "Logging channel not changed";
  } else {
    description = `Logging channel <#${previousChannelId}> removed`;
    title = "Logging channel removed";
  }
  const embed: APIEmbed = {
    title,
    color: embedPink,
    timestamp: new Date().toISOString(),
    description,
  };
  const logEmbed = { ...embed }; // make a copy not another reference
  logEmbed.fields = [
    {
      name: "Action By:",
      value: `<@${session.userId}>`,
    },
  ];
  if (previousChannelId !== null) {
    // Should not send a log if not changed

    // Sending log to previous channel
    await instance.webhookManager.sendWebhookMessage(
      previousChannelId,
      interaction.guild_id,
      {
        embeds: [logEmbed],
        username: "Message Manager Logging",
        avatarUrl: instance.envVars.AVATAR_URL,
      }
    );
  }

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [addTipToEmbed(embed)],
      flags: MessageFlags.Ephemeral,
    },
  };
}
async function handleLoggingChannelGetSubcommand({
  internalInteraction,
  instance,
}: {
  internalInteraction: InternalInteractionType<APIChatInputApplicationCommandGuildInteraction>;
  instance: FastifyInstance;
}): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;

  const logChannelId = await instance.loggingManager.getGuildLoggingChannel(
    interaction.guild_id
  );
  const embed: APIEmbed = {
    title: "Current logging channel",
    color: embedPink,
    timestamp: new Date().toISOString(),
    description:
      logChannelId !== null
        ? `The current logging channel is <#${logChannelId}>`
        : "No logging channel set",
  };

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [addTipToEmbed(embed)],
      flags: MessageFlags.Ephemeral,
    },
  };
}
