// Shared logic for permissions config embed generation
// In separate file as it's used in multiple places
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
import { addTipToEmbed } from "../../lib/tips";

// Options interfaces
interface CreatePermissionsEmbedOptions {
  targetType: string;
  targetId: Snowflake;
  channelId: Snowflake | null;
  guildId: Snowflake;
  instance: FastifyInstance;
  first: boolean;
  hasAdminPermission: boolean;
}

interface CreatePermissionsEmbedResult {
  embed: APIEmbed;
  components: APIActionRowComponent<APIMessageActionRowComponent>[];
}

/*
  Custom Id Format for manage permissions selects:
  <name: 'manage-permissions-select'>:<action: allow | deny>:<targetType: 'role' | 'user'>:<targetId: snowflake>:<channelId: snowflake | 'null'>:<hasAdminPermissions: 'true' | 'false'>
*/

// Generate a permissions embed for editing permissions
const createPermissionsEmbed = async ({
  targetType,
  targetId,
  channelId,
  guildId,
  instance,
  first,
  hasAdminPermission,
}: CreatePermissionsEmbedOptions): Promise<CreatePermissionsEmbedResult> => {
  // No permission checks are required here as they are either checked when the /config ... command is ran
  // or when the permissions are updated

  if (targetType === "role" && channelId === null) {
    // Different behavior for role without channel as does not have an explicit deny

    const options: APISelectMenuOption[] = []; // Array of potential options
    const currentPermissions =
      await instance.permissionManager.getRolePermissions({
        roleId: targetId,
        guildId: guildId,
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
      }); // Add option to array - each valid permission, and if it's currently set (default)
    }
    const title = "Managing permissions";
    // Make a map of permission names to the state ("allow", "deny") - used for visual representation of current state
    const permissionMap: { [key: string]: string } = {};
    for (const option of options) {
      permissionMap[option.label] = option.default ?? false ? "allow" : "deny";
    }

    const description =
      `Current permissions for role <@&${targetId}>\n` +
      (first
        ? ""
        : "Permissions have been updated - but you can keep managing them\n\n") +
      Object.entries(permissionMap)
        .map(([permission, state]): string => {
          return `${state === "allow" ? "✅" : "❌"} ${permission}`; // Display what each permission is currently
        })
        .join("\n");

    return {
      // Return embed + components
      embed: addTipToEmbed({ title, description, color: embedPink }),
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.SelectMenu,
              custom_id: `manage-permissions-select:null:${targetType}:${targetId}:null:${hasAdminPermission.toString()}`,
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
    // Channel role/user or guild user permissions editing
    let currentPermissions: PermissionAllowAndDenyData;
    let description: string;
    // Generate start message (what's being edited)
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
        guildId: guildId,
      });
    }

    if (!first) {
      // If not first time, add updated message
      description +=
        "\nPermissions have been updated - but you can keep managing them";
    }
    // Make a map of permission names to the state ("allow", "deny", "inherit") - used for visual representation of current state
    const permissionMap: { [key: string]: "allow" | "inherit" | "deny" } = {};
    const allowOptions: APISelectMenuOption[] = [];
    const denyOptions: APISelectMenuOption[] = [];

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
      permissionMap[internalPermission.readableName] =
        allowed && !denied ? "allow" : denied && !allowed ? "deny" : "inherit";
    }

    description +=
      "\n\n" +
      Object.entries(permissionMap)
        .map(([permission, state]): string => {
          return `${
            state === "allow" ? "✅" : state === "deny" ? "❌" : "➡️"
          } ${permission}`;
        })
        .join("\n"); // Add current state of each permission to description

    // Add note about admin permissions
    if (hasAdminPermission) {
      description +=
        "\n\nNote: The target has the discord `ADMINISTRATOR` permission. Any user with this permission will bypass bot permission checks (all will be allowed)";
    }
    // return embed and components
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
              )}:${hasAdminPermission.toString()}`,
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
              )}:${hasAdminPermission.toString()}`,
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
