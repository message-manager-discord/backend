import {
  APIApplicationCommandInteractionDataChannelOption,
  APIApplicationCommandInteractionDataIntegerOption,
  APIApplicationCommandInteractionDataMentionableOption,
  APIApplicationCommandInteractionDataSubcommandGroupOption,
  APIApplicationCommandInteractionDataSubcommandOption,
  APIChatInputApplicationCommandGuildInteraction,
  APIEmbed,
  APIInteractionDataResolvedChannel,
  ApplicationCommandOptionType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import {
  ExpectedFailure,
  ExpectedPermissionFailure,
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../../errors";

import { InternalInteraction } from "../../interaction";
import { Permission, PermissionsData } from "../../../lib/permissions/types";
import { embedPink } from "../../../constants";
import { checkManagementPermission } from "../../../lib/permissions/checks";
import { checkDiscordPermissionValue } from "../../../lib/permissions/discordChecks";
import { Permissions } from "../../../consts";
import { Guild } from "@prisma/client";
import {
  setChannelRolePermissions,
  setChannelUserPermissions,
  setGuildRolePermissions,
  setGuildUserPermissions,
} from "../../../lib/permissions/set";
import {
  getChannelPermissions,
  getGuildPermissionsWithChannels,
  GetGuildPermissionsWithChannelsReturnChannel,
} from "../../../lib/permissions/get";
import {
  removeChannelRolePermissions,
  removeChannelUserPermissions,
  removeGuildRolePermissions,
  removeGuildUserPermissions,
} from "../../../lib/permissions/remove";
import { InteractionReturnData } from "../../types";

export default async function handleConfigCommand(
  internalInteraction: InternalInteraction<APIChatInputApplicationCommandGuildInteraction>,
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
        instance
      );

    case "management-roles":
      return await handleManagementRolesSubcommand(
        internalInteraction,
        subcommand,
        instance
      );

    case "logging-channel":
      return await handleLoggingChannelSubcommandGroup(
        internalInteraction,
        subcommand,
        instance
      );

    default:
      throw new UnexpectedFailure(
        InteractionOrRequestFinalStatus.APPLICATION_COMMAND_UNEXPECTED_SUBCOMMAND,
        `Invalid subcommand: \`${subcommand.name}\``
      );
  }
}

async function handleManagementRolesSubcommand(
  internalInteraction: InternalInteraction<APIChatInputApplicationCommandGuildInteraction>,
  subcommandGroup: APIApplicationCommandInteractionDataSubcommandGroupOption,
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  if (
    !checkDiscordPermissionValue(
      BigInt(interaction.member.permissions),
      Permissions.ADMINISTRATOR
    )
  ) {
    throw new ExpectedPermissionFailure(
      InteractionOrRequestFinalStatus.USER_MISSING_DISCORD_PERMISSION,
      "You must be an administrator to use this command"
    );
  }

  const subcommand = subcommandGroup.options[0];

  switch (subcommand.name) {
    case "add":
      return await handleManagementRolesAddSubcommand({
        internalInteraction,
        subcommand,
        instance,
      });

    case "remove":
      return await handleManagementRolesRemoveSubcommand({
        internalInteraction,
        subcommand,
        instance,
      });

    case "list":
      return await handleManagementRolesListSubcommand({
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

async function handleManagementRolesAddSubcommand({
  internalInteraction,
  subcommand,
  instance,
}: {
  internalInteraction: InternalInteraction<APIChatInputApplicationCommandGuildInteraction>;
  subcommand: APIApplicationCommandInteractionDataSubcommandOption;
  instance: FastifyInstance;
}): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;

  const roleId: string | undefined = (
    subcommand.options?.find(
      (option) =>
        option.name === "role" &&
        option.type === ApplicationCommandOptionType.Role
    ) as APIApplicationCommandInteractionDataMentionableOption | undefined
  )?.value;
  if (!roleId) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_MISSING_EXPECTED_OPTION,
      "Missing role option"
    );
  }
  await instance.prisma.guild.upsert({
    where: { id: BigInt(interaction.guild_id) },
    update: {
      managementRoleIds: {
        push: BigInt(roleId),
      },
    },
    create: {
      id: BigInt(interaction.guild_id),
      managementRoleIds: [BigInt(roleId)],
    },
  });
  const embed: APIEmbed = {
    color: embedPink,
    title: "Added role to management roles",
    description: `Added role <@&${roleId}> to management roles.\n*Management roles allow non admin members to manage server config on the bot, like permissions, logs, etc*`,
  };
  const logEmbed = { ...embed };
  logEmbed.fields = [
    {
      name: "Action By:",
      value: `<@${interaction.member.user.id}>`,
    },
  ];
  // Send log message
  await instance.loggingManager.sendLogMessage({
    guildId: interaction.guild_id,
    embeds: [logEmbed],
  });
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      flags: MessageFlags.Ephemeral,
      embeds: [embed],
    },
  };
}
async function handleManagementRolesRemoveSubcommand({
  internalInteraction,
  subcommand,
  instance,
}: {
  internalInteraction: InternalInteraction<APIChatInputApplicationCommandGuildInteraction>;
  subcommand: APIApplicationCommandInteractionDataSubcommandOption;
  instance: FastifyInstance;
}): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;

  const roleId: string | undefined = (
    subcommand.options?.find(
      (option) =>
        option.name === "role" &&
        option.type === ApplicationCommandOptionType.Role
    ) as APIApplicationCommandInteractionDataMentionableOption | undefined
  )?.value;
  if (!roleId) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_MISSING_EXPECTED_OPTION,
      "Missing role option"
    );
  }
  const guild = await instance.prisma.guild.findUnique({
    where: { id: BigInt(interaction.guild_id) },
  });

  if (
    !guild ||
    !checkManagementPermission({
      managementRoles: guild.managementRoleIds,
      userRoles: [roleId],
    })
  ) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.NO_MANAGEMENT_ROLE_TO_REMOVE,
      "That role is not currently a management role"
    );
  }
  const newManagementRoleIds = guild.managementRoleIds.filter(
    (id) => id !== BigInt(roleId)
  );
  await instance.prisma.guild.upsert({
    where: { id: BigInt(interaction.guild_id) },
    update: {
      managementRoleIds: newManagementRoleIds,
    },
    create: {
      id: BigInt(interaction.guild_id),
      managementRoleIds: newManagementRoleIds,
    },
  });
  const embed: APIEmbed = {
    color: embedPink,
    title: "Removed role from management roles",
    description: `Removed role <@&${roleId}> from management roles.\n*Management roles allow non admin members to manage server config on the bot, like permissions, logs, etc*`,
  };

  const logEmbed = { ...embed };
  logEmbed.fields = [
    {
      name: "Action By:",
      value: `<@${interaction.member.user.id}>`,
    },
  ];
  // Send log message
  await instance.loggingManager.sendLogMessage({
    guildId: interaction.guild_id,
    embeds: [logEmbed],
  });
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      flags: MessageFlags.Ephemeral,
      embeds: [embed],
    },
  };
}

async function handleManagementRolesListSubcommand({
  internalInteraction,
  instance,
}: {
  internalInteraction: InternalInteraction<APIChatInputApplicationCommandGuildInteraction>;
  instance: FastifyInstance;
}): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;

  const guild = await instance.prisma.guild.findUnique({
    where: { id: BigInt(interaction.guild_id) },
  });

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      flags: MessageFlags.Ephemeral,
      embeds: [
        {
          color: embedPink,
          title: "Management roles:",
          description:
            `${
              guild &&
              guild.managementRoleIds &&
              guild.managementRoleIds.length > 0
                ? `<@&${guild.managementRoleIds.join(">, <@&")}>`
                : "No management roles set for the guild."
            }` +
            `\n*Management roles allow non admin members to manage server config on the bot, like permissions, logs, etc*`,
        },
      ],
    },
  };
}

async function handlePermissionsSubcommand(
  internalInteraction: InternalInteraction<APIChatInputApplicationCommandGuildInteraction>,
  subcommandGroup: APIApplicationCommandInteractionDataSubcommandGroupOption,
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  const guild = await instance.prisma.guild.findUnique({
    where: { id: BigInt(interaction.guild_id) },
  });
  if (
    !checkDiscordPermissionValue(
      BigInt(interaction.member.permissions),
      Permissions.ADMINISTRATOR
    ) &&
    !checkManagementPermission({
      managementRoles: guild?.managementRoleIds,
      userRoles: interaction.member.roles,
    })
  ) {
    throw new ExpectedPermissionFailure(
      InteractionOrRequestFinalStatus.USER_MISSING_INTERNAL_BOT_MANAGEMENT_PERMISSION,
      "You must be a bot manager (have a role assigned to be a management role), or an administrator to use this command"
    );
  }

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
        guildStored: guild,
      });

    case "set":
      return await handlePermissionsSetSubcommand({
        internalInteraction,
        instance,
        channel,
        subcommand,
        guildStored: guild,
      });

    case "remove":
      return await handlePermissionsRemoveSubcommand({
        internalInteraction,
        instance,
        channel,
        subcommand,
        guildStored: guild,
      });

    default:
      throw new UnexpectedFailure(
        InteractionOrRequestFinalStatus.APPLICATION_COMMAND_UNEXPECTED_SUBCOMMAND,
        `Invalid subcommand: \`${subcommand.name}\``
      );
  }
}

async function handlePermissionsSetSubcommand({
  internalInteraction,
  instance,
  channel,
  guildStored,
  subcommand,
}: {
  internalInteraction: InternalInteraction<APIChatInputApplicationCommandGuildInteraction>;
  instance: FastifyInstance;
  channel?: APIInteractionDataResolvedChannel;
  guildStored: Guild | null;
  subcommand: APIApplicationCommandInteractionDataSubcommandOption;
}): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;

  const targetId: string | undefined = (
    subcommand.options?.find(
      (option) =>
        option.name === "target" &&
        option.type === ApplicationCommandOptionType.Mentionable
    ) as APIApplicationCommandInteractionDataMentionableOption | undefined
  )?.value;
  if (!targetId) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_MISSING_EXPECTED_OPTION,
      "Missing target option"
    );
  }
  const permission: number | undefined = (
    subcommand.options?.find(
      (option) =>
        option.name === "permission" &&
        option.type === ApplicationCommandOptionType.Integer
    ) as APIApplicationCommandInteractionDataIntegerOption | undefined
  )?.value;
  if (!permission) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_MISSING_EXPECTED_OPTION,
      "Missing permission option"
    );
  }

  const resolvedData = interaction.data.resolved;
  let targetType: "role" | "user";
  let previousPermission: Permission | undefined;
  if (resolvedData?.roles && resolvedData.roles[targetId]) {
    targetType = "role";
    previousPermission = (guildStored?.permissions as PermissionsData).roles?.[
      targetId
    ];
    if (channel) {
      await setChannelRolePermissions({
        roleId: targetId,

        permission: permission,
        channelId: channel.id,
        instance,
        guildId: interaction.guild_id,
      });
    } else {
      await setGuildRolePermissions({
        roleId: targetId,

        permission: permission,
        guildId: interaction.guild_id,
        instance,
      });
    }
  } else if (
    resolvedData?.members &&
    resolvedData.members[targetId] &&
    resolvedData.users &&
    resolvedData.users[targetId]
  ) {
    targetType = "user";
    const targetUser = resolvedData.users[targetId];
    if (targetUser.bot) {
      throw new ExpectedFailure(
        InteractionOrRequestFinalStatus.BOT_FOUND_WHEN_USER_EXPECTED,
        "The target cannot be a bot"
      );
    }
    previousPermission = (guildStored?.permissions as PermissionsData).users?.[
      targetId
    ];
    if (channel) {
      await setChannelUserPermissions({
        userId: targetId,

        permission: permission,
        channelId: channel.id,
        instance,
        guildId: interaction.guild_id,
      });
    } else {
      await setGuildUserPermissions({
        userId: targetId,

        permission: permission,
        guildId: interaction.guild_id,
        instance,
      });
    }
  } else {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_RESOLVED_MISSING_EXPECTED_VALUE,
      "Target not found in resolved data"
    );
  }
  const embed: APIEmbed = {
    color: embedPink,
    title: "Permission set",
    description:
      `Set permission \`${Permission[permission]}\` for ${
        targetType == "role" ? `role <@&${targetId}>` : `user <@${targetId}>`
      } ` +
      (channel ? `on channel <#${channel.id}>` : "") +
      (previousPermission
        ? `\n\nPrevious permission: \`${Permission[previousPermission]}\``
        : ""),
  };

  const logEmbed = { ...embed };
  logEmbed.fields = [
    {
      name: "Action By:",
      value: `<@${interaction.member.user.id}>`,
    },
  ];
  // Send log message
  await instance.loggingManager.sendLogMessage({
    guildId: interaction.guild_id,
    embeds: [logEmbed],
  });

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      flags: MessageFlags.Ephemeral,
      embeds: [embed],
    },
  };
}

async function handlePermissionsRemoveSubcommand({
  internalInteraction,
  instance,
  channel,
  guildStored,
  subcommand,
}: {
  internalInteraction: InternalInteraction<APIChatInputApplicationCommandGuildInteraction>;
  instance: FastifyInstance;
  channel?: APIInteractionDataResolvedChannel;
  guildStored: Guild | null;

  subcommand: APIApplicationCommandInteractionDataSubcommandOption;
}): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;

  const targetId: string | undefined = (
    subcommand.options?.find(
      (option) =>
        option.name === "target" &&
        option.type === ApplicationCommandOptionType.Mentionable
    ) as APIApplicationCommandInteractionDataMentionableOption | undefined
  )?.value;
  if (!targetId) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_MISSING_EXPECTED_OPTION,
      "Missing target option"
    );
  }
  let previousPermission: Permission | undefined;

  const resolvedData = interaction.data.resolved;
  let targetType: "role" | "user";
  if (resolvedData?.roles && resolvedData.roles[targetId]) {
    targetType = "role";
    previousPermission = (guildStored?.permissions as PermissionsData).roles?.[
      targetId
    ];
    if (!previousPermission) {
      // Checks for Permission.NONE too as that's falsy
      throw new ExpectedFailure(
        InteractionOrRequestFinalStatus.NO_PERMISSION_TO_REMOVE,
        "No permission to remove for that role"
      );
    }

    if (channel) {
      await removeChannelRolePermissions({
        roleId: targetId,
        channelId: channel.id,
        instance,
        guildId: interaction.guild_id,
      });
    } else {
      await removeGuildRolePermissions({
        roleId: targetId,
        guildId: interaction.guild_id,
        instance,
      });
    }
  } else if (
    resolvedData?.members &&
    resolvedData.members[targetId] &&
    resolvedData.users &&
    resolvedData.users[targetId]
  ) {
    targetType = "user";
    previousPermission = (guildStored?.permissions as PermissionsData).users?.[
      targetId
    ];
    if (!previousPermission) {
      // Checks for Permission.NONE too as that's falsy
      throw new ExpectedFailure(
        InteractionOrRequestFinalStatus.NO_PERMISSION_TO_REMOVE,
        "No permission to remove for that role"
      );
    }
    if (channel) {
      await removeChannelUserPermissions({
        userId: targetId,
        channelId: channel.id,
        instance,
        guildId: interaction.guild_id,
      });
    } else {
      await removeGuildUserPermissions({
        userId: targetId,

        guildId: interaction.guild_id,
        instance,
      });
    }
  } else {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_RESOLVED_MISSING_EXPECTED_VALUE,
      "Target not found in resolved data"
    );
  }
  const embed: APIEmbed = {
    color: embedPink,
    title: "Permission removed",
    description:
      `Removed permission \`${
        previousPermission ? Permission[previousPermission] : "None"
      }\` for ${
        targetType == "role" ? `role <@&${targetId}>` : `user <@${targetId}>`
      } ` + (channel ? `on channel <#${channel.id}>` : ""),
  };
  const logEmbed = { ...embed };
  logEmbed.fields = [
    {
      name: "Action By:",
      value: `<@${interaction.member.user.id}>`,
    },
  ];
  // Send log message
  await instance.loggingManager.sendLogMessage({
    guildId: interaction.guild_id,
    embeds: [logEmbed],
  });
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      flags: MessageFlags.Ephemeral,
      embeds: [embed],
    },
  };
}
interface SortPermissionsReturn {
  delete: string[];
  edit: string[];
  send: string[];
  view: string[];
}

function sortPermissions(
  permissions: Record<string, number> | undefined
): SortPermissionsReturn {
  const sorted: SortPermissionsReturn = {
    delete: [],
    send: [],
    edit: [],
    view: [],
  };
  if (!permissions) {
    return sorted;
  }

  for (const objectId in permissions) {
    if (Object.prototype.hasOwnProperty.call(permissions, objectId)) {
      const permission = permissions[objectId];
      switch (permission) {
        case Permission.DELETE_MESSAGES:
          sorted.delete.push(objectId);
          break;
        case Permission.SEND_MESSAGES:
          sorted.send.push(objectId);
          break;
        case Permission.EDIT_MESSAGES:
          sorted.edit.push(objectId);
          break;
        case Permission.VIEW_MESSAGES:
          sorted.view.push(objectId);
          break;

        default:
          break;
      }
    }
  }
  return sorted;
}

function hasLevelPermissionsSet(permissionsLevel: Record<string, number>) {
  return Object.keys(permissionsLevel).length > 0;
}

function hasPermissionsSet(permissions: PermissionsData) {
  return (
    (permissions.users && hasLevelPermissionsSet(permissions.users)) ||
    (permissions.roles && hasLevelPermissionsSet(permissions.roles))
  );
}
async function handlePermissionsListSubcommand({
  instance,
  channel,
  guildStored,
  subcommand,
}: {
  instance: FastifyInstance;
  channel?: APIInteractionDataResolvedChannel;
  guildStored: Guild | null;

  subcommand: APIApplicationCommandInteractionDataSubcommandOption;
}): Promise<InteractionReturnData> {
  const filterBy: string | undefined = (
    subcommand.options?.find(
      (option) =>
        option.name === "type-filter" &&
        option.type === ApplicationCommandOptionType.String
    ) as APIApplicationCommandInteractionDataChannelOption
  )?.value;

  let permissions: PermissionsData;
  let channels: GetGuildPermissionsWithChannelsReturnChannel[] | null = null;
  let embedTitle = "";
  let levelMessage = "";
  if (channel) {
    embedTitle = `Bot permissions for users and roles on #${channel.name}`;
    levelMessage = `on <#${channel.id}>`;
    const data = await getChannelPermissions(channel.id, instance);
    permissions = data ? data : {};
  } else {
    // Guild level
    embedTitle = `Bot permissions for users and roles on the guild`;
    levelMessage = `on the guild`;
    if (!guildStored) {
      permissions = {};
    } else {
      const data = await getGuildPermissionsWithChannels(
        guildStored.id.toString(),
        instance
      );
      permissions = data && data.permissions ? data.permissions : {};
      channels = data ? data.channels : null;
    }
  }

  let description = "";

  if (filterBy !== "users") {
    if (permissions.roles) {
      const rolesSorted = sortPermissions(permissions.roles);
      if (hasLevelPermissionsSet(permissions.roles)) {
        description =
          `**Roles**:\n` +
          `${
            rolesSorted.delete.length
              ? `__Delete Messages__: <@&${rolesSorted.delete.join(
                  ">, <@&"
                )}>\n`
              : ""
          }` +
          `${
            rolesSorted.send.length
              ? `__Send Messages__: <@&${rolesSorted.send.join(">, <@&")}>\n`
              : ""
          }` +
          `${
            rolesSorted.edit.length
              ? `__Edit Messages__: <@&${rolesSorted.edit.join(">, <@&")}>\n`
              : ""
          }` +
          `${
            rolesSorted.view.length
              ? `__View Messages__: <@&${rolesSorted.view.join(">, <@&")}>\n`
              : ""
          }`;
      } else {
        description = `**No roles with bot permissions ${levelMessage}**\n`;
      }
    } else {
      description = `**No roles with bot permissions ${levelMessage}**\n`;
    }
  }
  if (filterBy !== "roles") {
    if (permissions.users) {
      const usersSorted = sortPermissions(permissions.users);
      if (hasLevelPermissionsSet(permissions.users)) {
        description =
          description +
          `\n**Users**:\n` +
          `${
            usersSorted.delete.length
              ? `__Delete Messages__: <@${usersSorted.delete.join(">, <@")}>\n`
              : ""
          }` +
          `${
            usersSorted.send.length
              ? `__Send Messages__: <@${usersSorted.send.join(">, <@")}>\n`
              : ""
          }` +
          `${
            usersSorted.edit.length
              ? `__Edit Messages__: <@${usersSorted.edit.join(">, <@")}>\n`
              : ""
          }` +
          `${
            usersSorted.view.length
              ? `__View Messages__: <@${usersSorted.view.join(">, <@")}>\n`
              : ""
          }`;
      } else {
        description =
          description + `\n**No users with bot permissions ${levelMessage}**\n`;
      }
    } else {
      description =
        description + `\n**No users with bot permissions ${levelMessage}**\n`;
    }
  }
  // Display channels with permissions on them
  if (channels) {
    const channelsWithPermissions = channels.filter(
      (channel) => channel.permissions && hasPermissionsSet(channel.permissions)
    );
    if (channelsWithPermissions.length > 0) {
      description =
        description +
        `\n**Other channels with bot permissions**: ${channelsWithPermissions
          .map((channel) => `<#${channel.id}>`)
          .join(", ")}\n`;
    }
  }

  // new line at start of user section to get more separation
  // Only display tip for the guild level command
  if (!channel) {
    description =
      description +
      "\n*To view permissions on a channel level pass the channel option on this command*";
  }

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [
        {
          title: `${embedTitle}${filterBy ? `, filtered by ${filterBy}` : ""}`,
          color: embedPink,
          timestamp: new Date().toISOString(),
          description,
          footer: {
            text: "Tip! Use /config permissions set, to add a user or role to bot permissions",
          },
        },
      ],
      flags: MessageFlags.Ephemeral,
    },
  };
}

async function handleLoggingChannelSubcommandGroup(
  internalInteraction: InternalInteraction<APIChatInputApplicationCommandGuildInteraction>,
  subcommandGroup: APIApplicationCommandInteractionDataSubcommandGroupOption,
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  if (
    !checkDiscordPermissionValue(
      BigInt(interaction.member.permissions),
      Permissions.ADMINISTRATOR
    )
  ) {
    throw new ExpectedPermissionFailure(
      InteractionOrRequestFinalStatus.USER_MISSING_DISCORD_PERMISSION,
      "You must be an administrator to use this command"
    );
  }

  const subcommand = subcommandGroup.options[0];

  switch (subcommand.name) {
    case "set":
      return await handleLoggingChannelSetSubcommand({
        internalInteraction,
        subcommand,
        instance,
      });

    case "remove":
      return await handleLoggingChannelRemoveSubcommand({
        internalInteraction,
        instance,
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
}: {
  internalInteraction: InternalInteraction<APIChatInputApplicationCommandGuildInteraction>;
  subcommand: APIApplicationCommandInteractionDataSubcommandOption;
  instance: FastifyInstance;
}): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  if (
    !checkDiscordPermissionValue(
      BigInt(interaction.member.permissions),
      Permissions.ADMINISTRATOR
    )
  ) {
    throw new ExpectedPermissionFailure(
      InteractionOrRequestFinalStatus.USER_MISSING_DISCORD_PERMISSION,
      "You must be an administrator to use this command"
    );
  }

  const channelId = (
    subcommand.options?.find(
      (option) =>
        option.type === ApplicationCommandOptionType.Channel &&
        option.name === "channel"
    ) as APIApplicationCommandInteractionDataChannelOption | undefined
  )?.value;
  if (!channelId) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_MISSING_EXPECTED_OPTION,
      "Missing channel option"
    );
  }
  // Webhook permissions are not checked here for the bot, since they are checked before setting the logging channel
  // This allows the logging channel to be set to a channel the bot has already created a webhook in, even if it does not currently have
  // the required permissions to create a webhook
  const previousChannelId =
    await instance.loggingManager.setGuildLoggingChannel(
      interaction.guild_id,
      channelId
    );

  let description: string;
  let title: string;
  if (previousChannelId === channelId) {
    description = `Logging channel not changed`;
    title = "Logging channel not changed";
  } else if (previousChannelId) {
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
      value: `<@${interaction.member.user.id}>`,
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
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    },
  };
}

async function handleLoggingChannelRemoveSubcommand({
  internalInteraction,
  instance,
}: {
  internalInteraction: InternalInteraction<APIChatInputApplicationCommandGuildInteraction>;
  instance: FastifyInstance;
}): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  if (
    !checkDiscordPermissionValue(
      BigInt(interaction.member.permissions),
      Permissions.ADMINISTRATOR
    )
  ) {
    throw new ExpectedPermissionFailure(
      InteractionOrRequestFinalStatus.USER_MISSING_DISCORD_PERMISSION,
      "You must be an administrator to use this command"
    );
  }

  // Webhook permissions are not checked here for the bot, since they are checked before setting the logging channel
  // This allows the logging channel to be set to a channel the bot has already created a webhook in, even if it does not currently have
  // the required permissions to create a webhook
  const previousChannelId =
    await instance.loggingManager.removeGuildLoggingChannel(
      interaction.guild_id
    );

  let description: string;
  let title: string;
  if (!previousChannelId) {
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
      value: `<@${interaction.member.user.id}>`,
    },
  ];
  if (previousChannelId) {
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
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    },
  };
}
async function handleLoggingChannelGetSubcommand({
  internalInteraction,
  instance,
}: {
  internalInteraction: InternalInteraction<APIChatInputApplicationCommandGuildInteraction>;
  instance: FastifyInstance;
}): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  if (
    !checkDiscordPermissionValue(
      BigInt(interaction.member.permissions),
      Permissions.ADMINISTRATOR
    )
  ) {
    throw new ExpectedPermissionFailure(
      InteractionOrRequestFinalStatus.USER_MISSING_DISCORD_PERMISSION,
      "You must be an administrator to use this command"
    );
  }

  const logChannelId = await instance.loggingManager.getGuildLoggingChannel(
    interaction.guild_id
  );
  const embed: APIEmbed = {
    title: "Current logging channel",
    color: embedPink,
    timestamp: new Date().toISOString(),
    description: logChannelId
      ? `The current logging channel is <#${logChannelId}>`
      : "No logging channel set",
  };

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    },
  };
}
