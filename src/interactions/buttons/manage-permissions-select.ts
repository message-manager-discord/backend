import {
  APIMessageComponentGuildInteraction,
  APIMessageSelectMenuInteractionData,
  APISelectMenuComponent,
  ComponentType,
  InteractionResponseType,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import { Snowflake } from "discord-api-types/globals";
import {
  ExpectedPermissionFailure,
  InteractionOrRequestFinalStatus,
} from "../../errors";
import { GuildSession } from "../../lib/session";
import { InternalInteractionType } from "../interaction";
import { InteractionReturnData } from "../types";
import {
  getInternalPermissionByName,
  InternalPermissions,
} from "../../lib/permissions/consts";
import { checkIfRoleIsBelowUsersHighestRole } from "../../lib/permissions/checks";
import createPermissionsEmbed from "../shared/permissions-config";

export default async function handleManagePermissionsSelect(
  internalInteraction: InternalInteractionType<APIMessageComponentGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  const customIdData = interaction.data.custom_id.split(":");
  const action = customIdData[1] as "allow" | "deny" | "null";
  const targetType = customIdData[2] as "role" | "user";
  const targetId = customIdData[3];
  const channelId = JSON.parse(customIdData[4]) as Snowflake | null;

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

  // Make the changes that were made just now
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
    await instance.permissionManager.allowRolePermissions({
      roleId: targetId,
      permissions: permissionsToAllow,
      guildId: session.guildId,
    });
    await instance.permissionManager.denyRolePermissions({
      roleId: targetId,
      permissions: permissionsToDeny,
      guildId: session.guildId,
    });
  }

  // There will be two selects, one for deny permissions and one for allow
  // If the select that was sent is the deny select, then deny values that were added, and "reset" values that were removed
  // If the select that was sent is the allow select, then allow values that were added, and "reset" values that were removed
  else if (action === "deny") {
    const permissionsToDeny: number[] = [];
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
        // This meant it was "denied" before but not included, therefore deselected
        const value = getInternalPermissionByName(option.value);
        if (value !== undefined) permissionsToReset.push(value);
      } else if (!(option.default ?? false) && included) {
        // This meant it was inherited(reset) or allowed before but now it is included, therefore selected
        const value = getInternalPermissionByName(option.value);
        if (value !== undefined) permissionsToDeny.push(value);
      }
    }
    if (targetType === "role" && channelId !== null) {
      await instance.permissionManager.denyChannelRolePermissions({
        roleId: targetId,
        channelId,
        permissions: permissionsToDeny,
        guildId: session.guildId,
      });
      await instance.permissionManager.resetChannelRolePermissions({
        roleId: targetId,
        channelId,
        permissions: permissionsToReset,
        guildId: session.guildId,
      });
    } else if (targetType === "user" && channelId !== null) {
      await instance.permissionManager.denyChannelUserPermissions({
        userId: targetId,
        permissions: permissionsToDeny,
        guildId: session.guildId,
        channelId,
      });
      await instance.permissionManager.resetChannelUserPermissions({
        userId: targetId,
        permissions: permissionsToReset,
        guildId: session.guildId,
        channelId,
      });
    } else {
      // User on a guild level
      await instance.permissionManager.denyUserPermissions({
        userId: targetId,
        permissions: permissionsToDeny,
        guildId: session.guildId,
      });
      await instance.permissionManager.resetUserPermissions({
        userId: targetId,
        permissions: permissionsToReset,
        guildId: session.guildId,
      });
    }
    // TODO Allow
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
      await instance.permissionManager.allowChannelRolePermissions({
        roleId: targetId,
        channelId,
        permissions: permissionsToAllow,
        guildId: session.guildId,
      });
      await instance.permissionManager.resetChannelRolePermissions({
        roleId: targetId,
        channelId,
        permissions: permissionsToReset,
        guildId: session.guildId,
      });
    } else if (targetType === "user" && channelId !== null) {
      await instance.permissionManager.allowChannelUserPermissions({
        userId: targetId,
        permissions: permissionsToAllow,
        guildId: session.guildId,
        channelId,
      });
      await instance.permissionManager.resetChannelUserPermissions({
        userId: targetId,
        permissions: permissionsToReset,
        guildId: session.guildId,
        channelId,
      });
    } else {
      // User on a guild level
      await instance.permissionManager.allowUserPermissions({
        userId: targetId,
        permissions: permissionsToAllow,
        guildId: session.guildId,
      });
      await instance.permissionManager.resetUserPermissions({
        userId: targetId,
        permissions: permissionsToReset,
        guildId: session.guildId,
      });
    }
  }

  const permissionReturnData = await createPermissionsEmbed({
    targetType,
    targetId,
    channelId,
    session,
    instance,
    first: false,
  });

  return {
    type: InteractionResponseType.UpdateMessage,
    data: {
      embeds: [permissionReturnData.embed],
      components: permissionReturnData.components,
    },
  };
}