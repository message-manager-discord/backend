import { Snowflake } from "discord-api-types/globals";
import { Guild } from "redis-discord-cache";

import { DiscordPermissionResult } from "./types";
import { checkDiscordPermissionValue, tryAndHandleGuildErrors } from "./utils";

const getUserDiscordPermission = ({
  userId,
  userRoles,
  channelId,
  guild,
}: {
  userId: Snowflake;
  userRoles: Snowflake[];
  channelId?: Snowflake;
  guild: Guild;
}): Promise<bigint> => {
  return tryAndHandleGuildErrors(async () => {
    let permission: bigint;
    if (channelId !== undefined) {
      permission = await guild.calculateChannelPermissions(
        userId,
        userRoles,
        channelId
      );
    } else {
      permission = await guild.calculateGuildPermissions(userId, userRoles);
    }
    return permission;
  });
};

const checkUserDiscordPermission = ({
  userId,
  userRoles,
  channelId,
  guild,
  requiredPermissions,
}: {
  userId: Snowflake;
  userRoles: Snowflake[];
  channelId?: Snowflake;
  guild: Guild;
  requiredPermissions: bigint | bigint[];
}): Promise<DiscordPermissionResult> => {
  return tryAndHandleGuildErrors(async () => {
    const permission = await getUserDiscordPermission({
      userId,
      userRoles,
      channelId,
      guild,
    });
    if (typeof requiredPermissions === "bigint") {
      if (checkDiscordPermissionValue(permission, requiredPermissions)) {
        return {
          allPresent: true,
          present: [requiredPermissions],
        };
      } else {
        return {
          allPresent: false,
          present: [],
          missing: [requiredPermissions],
        };
      }
    } else {
      const missing: bigint[] = [];
      const present: bigint[] = [];
      for (const perm of requiredPermissions) {
        if (checkDiscordPermissionValue(permission, perm)) {
          present.push(perm);
        } else {
          missing.push(perm);
        }
      }
      if (missing.length > 0) {
        return {
          allPresent: false,
          present,
          missing,
        };
      } else {
        return {
          allPresent: true,
          present,
        };
      }
    }
  });
};

const getBotDiscordPermission = ({
  guild,
  channelId,
}: {
  guild: Guild;
  channelId?: Snowflake;
}): Promise<bigint> => {
  return tryAndHandleGuildErrors(async () => {
    let permission: bigint;
    if (channelId !== undefined) {
      permission = await guild.calculateBotChannelPermissions(channelId);
    } else {
      permission = await guild.calculateBotGuildPermissions();
    }
    return permission;
  });
};

const checkBotDiscordPermission = ({
  guild,
  channelId,
  requiredPermissions,
}: {
  guild: Guild;
  channelId?: Snowflake;
  requiredPermissions: bigint | bigint[];
}): Promise<DiscordPermissionResult> => {
  return tryAndHandleGuildErrors(async () => {
    const permissions = await getBotDiscordPermission({
      guild,
      channelId,
    });
    if (typeof requiredPermissions === "bigint") {
      if (checkDiscordPermissionValue(permissions, requiredPermissions)) {
        return {
          allPresent: true,
          present: [requiredPermissions],
        };
      } else {
        return {
          allPresent: false,
          present: [],
          missing: [requiredPermissions],
        };
      }
    } else {
      const present: bigint[] = [];
      const missing: bigint[] = [];
      for (const perm of requiredPermissions) {
        if (checkDiscordPermissionValue(permissions, perm)) {
          present.push(perm);
        } else {
          missing.push(perm);
        }
      }
      if (missing.length > 0) {
        return {
          allPresent: false,
          present,
          missing,
        };
      } else {
        return {
          allPresent: true,
          present,
        };
      }
    }
  });
};

export { checkBotDiscordPermission,checkUserDiscordPermission };
