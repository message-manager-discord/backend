import {
  APIEmbed,
  APISelectMenuOption,
  ButtonStyle,
  ComponentType,
  APIMessageActionRowComponent,
  APIActionRowComponent,
} from "discord-api-types/v9";
import { Snowflake } from "discord-api-types/globals";
import { FastifyInstance } from "fastify";
import {
  ExpectedPermissionFailure,
  InteractionOrRequestFinalStatus,
} from "../../errors";

import { embedPink } from "../../constants";

import { addTipToEmbed } from "../../lib/tips";
import { GuildSession } from "../../lib/session";
import { checkInternalPermissionValue } from "../../lib/permissions/utils";
import { UsableInternalPermissions } from "../../lib/permissions/consts";
import { PermissionAllowAndDenyData } from "../../lib/permissions/types";
import { checkIfRoleIsBelowUsersHighestRole } from "../../lib/permissions/checks";

interface CreatePermissionsEmbedOptions {
  targetType: string;
  targetId: Snowflake;
  channelId: Snowflake | null;
  session: GuildSession;
  instance: FastifyInstance;
  first: boolean;
}

interface CreatePermissionsEmbedResult {
  embed: APIEmbed;
  components: APIActionRowComponent<APIMessageActionRowComponent>[];
}

const createPermissionsEmbed = async ({
  targetType,
  targetId,
  channelId,
  session,
  instance,
  first,
}: CreatePermissionsEmbedOptions): Promise<CreatePermissionsEmbedResult> => {
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

  if (targetType === "role" && channelId === null) {
    // Different behavior as does not have an explicit deny

    const options: APISelectMenuOption[] = [];
    const currentPermissions =
      await instance.permissionManager.getRolePermissions({
        roleId: targetId,
        guildId: session.guildId,
      });
    for (const internalPermission of UsableInternalPermissions) {
      options.push({
        label: internalPermission.readableName,
        value: internalPermission.name,
        description: internalPermission.description,
        default: checkInternalPermissionValue(
          currentPermissions,
          internalPermission.value
        ),
      });
    }
    const title = "Managing permissions";
    const allowedPermissions = options
      .filter((option) => option.default)
      .map((option) => option.label);
    const deniedPermissions = options
      .filter((option) => !(option.default ?? false))
      .map((option) => option.label);
    const description =
      `
        Current permissions for role <@&${targetId}>\n` +
      (first
        ? ""
        : "Permissions have been updated - but you can keep managing them\n\n") +
      `**✅ Allowed:** ${
        allowedPermissions.length > 0 ? allowedPermissions.join(", ") : "None"
      }\n` +
      `**❌ Denied:** ${
        deniedPermissions.length > 0 ? deniedPermissions.join(", ") : "None"
      }
        `;
    return {
      embed: addTipToEmbed({ title, description, color: embedPink }),
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.SelectMenu,
              custom_id: `manage-permissions-select:null:${targetType}:${targetId}:null`,
              options,
              max_values: options.length,
              min_values: 0,
              placeholder: "Select permissions to allow",
            },
          ],
        },
      ],
    };
  } else {
    let currentPermissions: PermissionAllowAndDenyData;
    let description: string;
    if (targetType === "role" && channelId !== null) {
      description = `Current permissions for role <@&${targetId}> on channel <#${channelId}>`;
      currentPermissions =
        await instance.permissionManager.getChannelRolePermissions({
          roleId: targetId,
          channelId,
        });
    } else if (targetType === "user" && channelId !== null) {
      description = `Current permissions for user <@${targetId}> on channel <#${channelId}>`;
      currentPermissions =
        await instance.permissionManager.getChannelUserPermissions({
          userId: targetId,
          channelId,
        });
    } else {
      description = `Current permissions for user <@${targetId}>`;
      currentPermissions = await instance.permissionManager.getUserPermissions({
        userId: targetId,
        guildId: session.guildId,
      });
    }
    if (!first) {
      description +=
        "\nPermissions have been updated - but you can keep managing them";
    }
    const allowOptions: APISelectMenuOption[] = [];
    const denyOptions: APISelectMenuOption[] = [];
    const inheritedPermissions: string[] = [];
    const allowedPermissions: string[] = [];
    const deniedPermissions: string[] = [];
    // If the permission is present in deny permissions it will be default in deny options
    // and vice versa
    // All permissions will be in both options
    for (const internalPermission of UsableInternalPermissions) {
      if (channelId !== null && !internalPermission.channelOverrideAllowed) {
        // Permission cannot be set on a channel
        continue;
      }
      const allowed = checkInternalPermissionValue(
        currentPermissions.allow,
        internalPermission.value
      );
      const denied = checkInternalPermissionValue(
        currentPermissions.deny,
        internalPermission.value
      );
      allowOptions.push({
        label: internalPermission.readableName,
        value: internalPermission.name,
        description: internalPermission.description,
        default: allowed,
      });
      denyOptions.push({
        label: internalPermission.readableName,
        value: internalPermission.name,
        description: internalPermission.description,
        default: denied,
      });
      if (allowed) {
        allowedPermissions.push(internalPermission.readableName);
      } else if (denied) {
        deniedPermissions.push(internalPermission.readableName);
      } else {
        // As it will be hard to filter out inherited permissions from options
        inheritedPermissions.push(internalPermission.readableName);
      }
    }

    description +=
      `\n\n**✅ Allowed:** ${
        allowedPermissions.length > 0 ? allowedPermissions.join(", ") : "None"
      }\n` +
      `**⚠️ Inherited:** ${
        inheritedPermissions.length > 0
          ? inheritedPermissions.join(", ")
          : "None"
      }\n` +
      `**❌ Denied:** ${
        deniedPermissions.length > 0 ? deniedPermissions.join(", ") : "None"
      }`;

    return {
      embed: addTipToEmbed({
        title: "Managing permissions",
        description,
        color: embedPink,
      }),

      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              label: "Allow Overrides:",
              custom_id: "allow-placeholder-button",
              style: ButtonStyle.Success,
              disabled: true,
              emoji: {
                name: "✅",
              },
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.SelectMenu,
              custom_id: `manage-permissions-select:allow:${targetType}:${targetId}:${JSON.stringify(
                channelId
              )}`,
              options: allowOptions,
              placeholder: "Select permissions to allow",
              max_values: allowOptions.length,
              min_values: 0,
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              label: "Deny Overrides:",
              custom_id: "deny-placeholder-button",
              style: ButtonStyle.Danger,
              disabled: true,
              emoji: {
                name: "❌",
              },
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.SelectMenu,
              custom_id: `manage-permissions-select:deny:${targetType}:${targetId}:${JSON.stringify(
                channelId
              )}`,
              options: denyOptions,
              placeholder: "Select permissions to deny",
              max_values: denyOptions.length,
              min_values: 0,
            },
          ],
        },
      ],
    };
  }
};
export default createPermissionsEmbed;
//TODO Investigate issue with indent on moile
