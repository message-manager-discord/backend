// Handle select menu for editing permissions
import { Snowflake } from "discord-api-types/globals";
import {
  APIMessageComponentGuildInteraction,
  APIMessageSelectMenuInteractionData,
  APISelectMenuComponent,
  ComponentType,
  InteractionResponseType,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import { getInternalPermissionByName } from "../../lib/permissions/consts";
import { GuildSession } from "../../lib/session";
import { InternalInteractionType } from "../interaction";
import createPermissionsEmbed from "../shared/permissions-config";
import { InteractionReturnData } from "../types";

// Function to handle the permissions editing select menu
export default async function handleManagePermissionsSelect(
  internalInteraction: InternalInteractionType<APIMessageComponentGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  const customIdData = interaction.data.custom_id.split(":");
  const action = customIdData[1] as "allow" | "deny" | "null"; // The action being performed
  const targetType = customIdData[2] as "role" | "user"; // The target type
  const targetId = customIdData[3];
  const channelId = JSON.parse(customIdData[4]) as Snowflake | null; // The channel id
  const hasAdminPermission = JSON.parse(customIdData[5]) as boolean; // Whether the user has admin permission

  // No permission checks are required here as they are either checked when the /config ... command is ran
  // or when the permissions are updated
  // This interaction **will** cause permissions to be updated

  // Make the changes
  const values = (interaction.data as APIMessageSelectMenuInteractionData)
    .values;
  if (action === "null") {
    // This is the guild level role
    const permissionsToDeny: number[] = [];
    const permissionsToAllow: number[] = [];
    const selectMenu = interaction.message.components?.[0].components.find(
      (component) =>
        component.type === ComponentType.SelectMenu &&
        component.custom_id === interaction.data.custom_id
    ) as APISelectMenuComponent;

    const options = selectMenu.options;
    for (const option of options) {
      const included = values.includes(option.value);
      if ((option.default ?? false) && !included) {
        // This meant it was "allowed" before but not included, therefore deselected
        const value = getInternalPermissionByName(option.value);
        if (value !== undefined) permissionsToDeny.push(value);
      } else if (!(option.default ?? false) && included) {
        // This meant it was "denied" before but now it is included, therefore selected
        const value = getInternalPermissionByName(option.value);
        if (value !== undefined) permissionsToAllow.push(value);
      }
    }
    await instance.permissionManager.setRolePermissions({
      roleId: targetId,
      permissionsToAllow,
      permissionsToDeny,
      session,
      messageId: interaction.message.id,
    });
  }

  // There will be two selects, one for deny permissions and one for allow
  // If the select that was sent is the deny select, then deny values that were added, and "reset" values that were removed
  // If the select that was sent is the allow select, then allow values that were added, and "reset" values that were removed
  // Only one select may be sent at a time (discord side)
  else if (action === "deny") {
    const permissionsToDeny: number[] = [];
    const permissionsToReset: number[] = [];
    const selectMenu = interaction.message.components?.find(
      (component) =>
        component.components[0].type === ComponentType.SelectMenu &&
        component.components[0].custom_id === interaction.data.custom_id
    )?.components[0] as APISelectMenuComponent; // Find select menu data in interaction data
    const options = selectMenu.options;
    for (const option of options) {
      const included = values.includes(option.value);
      if ((option.default ?? false) && !included) {
        // This meant it was "denied" before but not included, therefore deselected
        const value = getInternalPermissionByName(option.value);
        if (value !== undefined) permissionsToReset.push(value);
      } else if (!(option.default ?? false) && included) {
        // This meant it was inherited(reset) or allowed before but now it is included, therefore selected
        const value = getInternalPermissionByName(option.value);
        if (value !== undefined) permissionsToDeny.push(value);
      }
    }
    // Update permissions
    if (targetType === "role" && channelId !== null) {
      await instance.permissionManager.setChannelRolePermissions({
        channelId,
        roleId: targetId,
        permissionsToAllow: [],
        permissionsToDeny,
        permissionsToReset,
        session,

        messageId: interaction.message.id,
      });
    } else if (targetType === "user") {
      await instance.permissionManager.setUserPermissions({
        userId: targetId,
        permissionsToAllow: [],
        permissionsToReset,
        permissionsToDeny,
        session,
        channelId: channelId !== null ? channelId : undefined, // Handles both channel user and guild user perms with this field

        messageId: interaction.message.id,
      });
    }
  } else {
    // Action is allow
    const permissionsToAllow: number[] = [];
    const permissionsToReset: number[] = [];
    const selectMenu = interaction.message.components?.find(
      (component) =>
        component.components[0].type === ComponentType.SelectMenu &&
        component.components[0].custom_id === interaction.data.custom_id
    )?.components[0] as APISelectMenuComponent;
    const options = selectMenu.options;
    for (const option of options) {
      const included = values.includes(option.value);
      if ((option.default ?? false) && !included) {
        // This meant it was "allowed" before but not included, therefore deselected
        const value = getInternalPermissionByName(option.value);
        if (value !== undefined) permissionsToReset.push(value);
      } else if (!(option.default ?? false) && included) {
        // This meant it was inherited(reset) or denied before but now it is included, therefore selected
        const value = getInternalPermissionByName(option.value);
        if (value !== undefined) permissionsToAllow.push(value);
      }
    }
    if (targetType === "role" && channelId !== null) {
      await instance.permissionManager.setChannelRolePermissions({
        channelId,
        roleId: targetId,
        permissionsToDeny: [],
        permissionsToReset,
        permissionsToAllow,
        session,

        messageId: interaction.message.id,
      });
    } else if (targetType === "user") {
      await instance.permissionManager.setUserPermissions({
        userId: targetId,
        permissionsToAllow: permissionsToAllow,
        permissionsToReset: permissionsToReset,
        permissionsToDeny: [],
        session,
        channelId: channelId !== null ? channelId : undefined, // Handles both channel user and guild user perms with this field

        messageId: interaction.message.id,
      });
    }
  }
  // Embed to return in update interaction - uses updated data from database
  const permissionReturnData = await createPermissionsEmbed({
    targetType,
    targetId,
    channelId,
    guildId: session.guildId,
    instance,
    first: false,
    hasAdminPermission,
  });
  // register interaction with permission interaction cache - to extend lifetime of update system
  instance.permissionManager.interactionCacheManager.registerInteraction({
    targetId,
    targetType,
    channelId,
    guildId: session.guildId,
    messageId: interaction.message.id,
    interactionId: interaction.id,
    interactionToken: interaction.token,
  });

  return {
    type: InteractionResponseType.UpdateMessage,
    data: {
      embeds: [permissionReturnData.embed],
      components: permissionReturnData.components,
    },
  };
}
