import { Snowflake } from "discord-api-types/globals";
import { Guild } from "redis-discord-cache";
import {
  ChannelNotFound,
  GuildNotFound,
  GuildUnavailable,
} from "redis-discord-cache/dist/errors";
import { DiscordPermissions } from "../../consts";
import {
  ExpectedPermissionFailure,
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors";
import { GuildSession } from "../session";
import { InternalPermissions } from "./consts";

const checkDiscordPermissionValue = (
  existingPermission: bigint,
  permission: bigint
): boolean => {
  const adminPerm =
    (existingPermission & DiscordPermissions.ADMINISTRATOR) ===
    DiscordPermissions.ADMINISTRATOR;
  const otherPerm = (existingPermission & permission) === permission;

  return adminPerm || otherPerm;
};

const checkInternalPermissionValue = (
  existingPermission: number,
  permission: number
): boolean => {
  return (existingPermission & permission) === permission;
};

const tryAndHandleGuildErrors = async <T>(
  func: () => Promise<T>
): Promise<T> => {
  try {
    return await func();
  } catch (e) {
    if (e instanceof GuildNotFound) {
      throw new ExpectedPermissionFailure(
        InteractionOrRequestFinalStatus.BOT_MISSING_DISCORD_SCOPE,
        `Guild ${"null"} not cached. This is likely due to the bot missing the \`bot\` scope. Please reinvite the bot to fix this.`
      );
    } else if (e instanceof GuildUnavailable) {
      throw new UnexpectedFailure(
        InteractionOrRequestFinalStatus.GUILD_UNAVAILABLE_BUT_SENDING_INTERACTIONS,
        `Guild ${"guild.id"} is unavailable. This is likely due to the bot being offline. Please try again later, and if this error persists, please contact the bot developers.`
      );
    } else if (e instanceof ChannelNotFound) {
      throw new ExpectedPermissionFailure(
        InteractionOrRequestFinalStatus.BOT_MISSING_DISCORD_PERMISSION,
        `Channel ${"channelId"} not cached. This is likely due to the bot missing the \`VIEW_CHANNELS\` permission. Please make sure the bot has the correct permissions in that channel.`
      );
    } else {
      throw e;
    }
  }
};

async function checkIfUserCanManageRolePermissions({
  guild,
  roleId,
  session,
}: {
  guild: Guild;
  roleId: Snowflake;
  session: GuildSession;
}): Promise<boolean> {
  const userRolesAboveRole = await guild.checkIfRoleIsLowerThanUsersRole(
    roleId,
    session.userRoles,
    session.userId
  );
  const role = await guild.getRole(roleId);

  if (!role) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.ROLE_NOT_IN_CACHE,
      "Role missing from cache"
    );
  } // Check, as checkIfRoleIsLowerThanUsersRole just ignores it is the role is missing

  if (
    !(
      await session.hasBotPermissions(
        InternalPermissions.MANAGE_PERMISSIONS,
        session.guildId
      )
    ).allPresent
  ) {
    return false;
  }
  return userRolesAboveRole;
}

export {
  checkDiscordPermissionValue,
  tryAndHandleGuildErrors,
  checkIfUserCanManageRolePermissions,
  checkInternalPermissionValue,
};
