// Config top level command - contains subcommands for permissions and logging channels
import axios from "axios";
import { Snowflake } from "discord-api-types/globals";
import {
  APIApplicationCommandInteractionDataChannelOption,
  APIApplicationCommandInteractionDataMentionableOption,
  APIApplicationCommandInteractionDataStringOption,
  APIApplicationCommandInteractionDataSubcommandGroupOption,
  APIApplicationCommandInteractionDataSubcommandOption,
  APIChatInputApplicationCommandGuildInteraction,
  APIEmbed,
  APIInteractionDataResolvedChannel,
  APIInteractionResponseChannelMessageWithSource,
  ApplicationCommandOptionType,
  InteractionResponseType,
  MessageFlags,
  RESTGetAPIInteractionOriginalResponseResult,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import { discordAPIBaseURL, embedPink } from "../../../constants";
import { DiscordPermissions } from "../../../consts";
import {
  ExpectedFailure,
  ExpectedPermissionFailure,
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../../errors";
import { checkIfRoleIsBelowUsersHighestRole } from "../../../lib/permissions/checks";
import { InternalPermissions } from "../../../lib/permissions/consts";
import { checkDiscordPermissionValue } from "../../../lib/permissions/utils";
import { GuildSession } from "../../../lib/session";
import { addTipToEmbed } from "../../../lib/tips";
import { InternalInteractionType } from "../../interaction";
import createPermissionsEmbed from "../../shared/permissions-config";
import { InteractionReturnData } from "../../types";

// Handle top level command
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
  // Send to different handlers for subcommands
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

// Permissions 1st level subcommand
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

  // Send to different handlers for 2nd level subcommand (for example /config permissions list)
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

    case "quickstart":
      return await handlePermissionsQuickstartSubcommand({
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

// Returns a list of all entities with permissions set
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
    description = `Users and roles with permissions on ${channel.name ?? ""}`;
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
  // Create description with two separate parts for roles and users
  // The actual permissions of each cannot be displayed here as there is not enough space
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
          title: `Permissions for ${
            channel ? "#" + (channel.name ?? "") : "guild"
          }`,
          description: description + extraDescription,
          color: embedPink,
        }),
      ],
      flags: MessageFlags.Ephemeral,
    },
  };
}

// For specific entities - viewing and editing their individual permissions
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
  let targetPermissions: Snowflake | undefined;
  // find target in data

  if (resolvedData?.roles && resolvedData.roles[targetId] !== undefined) {
    targetType = "role";
    targetPermissions = resolvedData.roles[targetId].permissions;
  } else if (
    resolvedData?.users &&
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
    // If the user is in the guild, then it will be in the members resolved data
    // Otherwise not
    // If the user is in the guild, set the permissions value to it's permissions
    if (resolvedData?.members && resolvedData.members[targetId] !== undefined) {
      targetPermissions =
        resolvedData.members[targetId].permissions ?? undefined;
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

  // For adding a tip about admin permission overriding all internal permissions
  const hasAdminPermission =
    targetPermissions !== undefined &&
    checkDiscordPermissionValue(
      BigInt(targetPermissions),
      DiscordPermissions.ADMINISTRATOR
    );

  // create embed representation for permissions viewing / editing
  const permissionReturnData = await createPermissionsEmbed({
    targetType,
    targetId,
    channelId: channel?.id ?? null,
    guildId: session.guildId,
    instance,
    first: true,
    hasAdminPermission,
  });

  // Void function that waits a bit then fetches the original interaction message
  // To get it's message id for updating the message
  void (async () => {
    // Ensure the interaction was responded to (it's a bit overkill but it doesn't really matter too much)
    await new Promise((resolve) => setTimeout(resolve, 1000));
    instance.permissionManager.interactionCacheManager.registerInteraction({
      targetId: targetId,
      targetType: targetType,
      channelId: channel?.id ?? null,
      guildId: session.guildId,
      interactionId: interaction.id,
      interactionToken: interaction.token,
      messageId: (
        (
          await axios.request({
            method: "GET",
            url: `${discordAPIBaseURL}/webhooks/${instance.envVars.DISCORD_CLIENT_ID}/${internalInteraction.interaction.token}/messages/@original`,
          })
        ).data as RESTGetAPIInteractionOriginalResponseResult
      ).id,
    });
  })();
  // return response
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [permissionReturnData.embed],
      components: permissionReturnData.components,
      flags: MessageFlags.Ephemeral,
    },
  };
}

// Quickstart is for setting quick defaults for roles (for users who don't want to get too involved in the permissions system)
async function handlePermissionsQuickstartSubcommand({
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
  // Get target data
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
  let targetType: "role" | "user";
  let targetPermissions: Snowflake | undefined;
  const resolvedData = interaction.data.resolved;

  if (resolvedData?.roles && resolvedData.roles[targetId] !== undefined) {
    targetType = "role";
    targetPermissions = resolvedData.roles[targetId].permissions;
  } else if (
    resolvedData?.users &&
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
    // If the user is in the guild, then it will be in the members resolved data
    // Otherwise not
    // If the user is in the guild, set the permissions value to it's permissions
    if (resolvedData?.members && resolvedData.members[targetId] !== undefined) {
      targetPermissions =
        resolvedData.members[targetId].permissions ?? undefined;
    }
  } else {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_RESOLVED_MISSING_EXPECTED_VALUE,
      "Target not found in resolved data"
    );
  }

  const preset: "message-access" | "management-access" | undefined = (
    subcommand.options?.find(
      (option) =>
        option.name === "preset" &&
        option.type === ApplicationCommandOptionType.String
    ) as APIApplicationCommandInteractionDataStringOption | undefined
  )?.value as "message-access" | "management-access" | undefined;

  if (preset === "management-access" && channel !== undefined) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MANAGEMENT_PERMISSIONS_CANNOT_BE_SET_ON_CHANNEL_LEVEL,
      "The management preset can only be set on guild level"
    );
  }

  // Message-access preset will allow the permissions for all message management actions
  // I.E. view, edit, send, delete
  let permissions: number[] = [];
  if (preset === "message-access") {
    permissions = [
      InternalPermissions.VIEW_MESSAGES,
      InternalPermissions.EDIT_MESSAGES,
      InternalPermissions.SEND_MESSAGES,
      InternalPermissions.DELETE_MESSAGES,
    ];
  }
  // Management access preset will allow permissions for management of the bot
  // I.E. access to permissions and config
  if (preset === "management-access") {
    permissions = [
      ...permissions,
      InternalPermissions.MANAGE_PERMISSIONS,
      InternalPermissions.MANAGE_CONFIG,
    ];
  }

  // Set the permissions
  if (targetType === "role" && channel === undefined) {
    await instance.permissionManager.setRolePermissions({
      roleId: targetId,
      permissionsToAllow: permissions,
      permissionsToDeny: [],
      session,
    });
  } else if (targetType === "role" && channel !== undefined) {
    await instance.permissionManager.setChannelRolePermissions({
      channelId: channel.id,
      roleId: targetId,
      permissionsToAllow: permissions,
      permissionsToDeny: [],
      permissionsToReset: [],
      session,
    });
  } else {
    await instance.permissionManager.setUserPermissions({
      userId: targetId,
      permissionsToAllow: permissions,
      permissionsToDeny: [],
      permissionsToReset: [],
      session,
      channelId: channel?.id,
    });
  }

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [
        addTipToEmbed({
          title: "Permissions Quickstart",
          description:
            `The permissions preset ${
              preset === "message-access"
                ? "message access with the permissions `VIEW_MESSAGES`, `EDIT_MESSAGES`, `SEND_MESSAGES`, `DELETE_MESSAGES` "
                : ""
            }` +
            `${
              preset === "management-access"
                ? "the permissions preset management access with the permissions `MANAGE_PERMISSIONS`, `MANAGE_CONFIG` "
                : ""
            }` +
            `have been allowed for ${
              targetType === "user" ? `<@${targetId}>` : `<@&${targetId}>`
            }${
              channel !== undefined ? ` on the channel <#${channel.id}>` : ""
            }.` + // Add note if the target has admin perms about how they bypass permissions
            (targetPermissions !== undefined
              ? checkDiscordPermissionValue(
                  BigInt(targetPermissions),
                  DiscordPermissions.ADMINISTRATOR
                )
                ? "\n\nNote: The target has the discord `ADMINISTRATOR` permission. Any user with this permission will bypass bot permission checks (all will be allowed)"
                : ""
              : ""),
          color: embedPink,
          timestamp: new Date().toISOString(),
        }),
      ],
      flags: MessageFlags.Ephemeral,
    },
  };
}

// 1st level subcommand for logging channels
async function handleLoggingChannelSubcommandGroup(
  internalInteraction: InternalInteractionType<APIChatInputApplicationCommandGuildInteraction>,
  subcommandGroup: APIApplicationCommandInteractionDataSubcommandGroupOption,
  instance: FastifyInstance,
  session: GuildSession
): Promise<InteractionReturnData> {
  const subcommand = subcommandGroup.options[0];
  // 2nd level subcommands for logging channels
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

// 2nd level subcommand for setting logging channels
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
  // find target channel
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
  // Different changes
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
  // Generate embed and log embed
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
      session,
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

// 2nd level subcommand for removing logging channels
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

  // No target as there is only one logging channel per guild

  // Webhook permissions are not checked here for the bot, since they are checked before setting the logging channel
  // This allows the logging channel to be set to a channel the bot has already created a webhook in, even if it does not currently have
  // the required permissions to create a webhook
  const previousChannelId =
    await instance.loggingManager.removeGuildLoggingChannel(session);

  let description: string;
  let title: string;
  // Different changes
  if (previousChannelId === null) {
    description = `Logging channel not changed`;
    title = "Logging channel not changed";
  } else {
    description = `Logging channel <#${previousChannelId}> removed`;
    title = "Logging channel removed";
  }

  // Generate embed and log embed
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

    // Sending log to previous channel (webhook isn't deleted)
    await instance.webhookManager.sendWebhookMessage(
      previousChannelId,
      interaction.guild_id,
      {
        embeds: [logEmbed],
        username: "Message Manager Logging",
        avatar_url: instance.envVars.AVATAR_URL,
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
// Just get the current channel - no change
async function handleLoggingChannelGetSubcommand({
  internalInteraction,
  instance,
}: {
  internalInteraction: InternalInteractionType<APIChatInputApplicationCommandGuildInteraction>;
  instance: FastifyInstance;
}): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  // No target as there is only one logging channel per guild

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
