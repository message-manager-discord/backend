import { Snowflake } from "discord-api-types/globals";
import {
  APIActionRowComponent,
  APIEmbed,
  APIMessageActionRowComponent,
  APISelectMenuOption,
  ButtonStyle,
  ComponentType,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import { embedPink } from "../../constants";
import { UsableInternalPermissions } from "../../lib/permissions/consts";
import { PermissionAllowAndDenyData } from "../../lib/permissions/types";
import { checkInternalPermissionValue } from "../../lib/permissions/utils";
import { GuildSession } from "../../lib/session";
import { addTipToEmbed } from "../../lib/tips";

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
  // No permission checks are required here as they are either checked when the /config ... command is ran
  // or when the permissions are updated

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
      `**➡️ Inherited:** ${
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
