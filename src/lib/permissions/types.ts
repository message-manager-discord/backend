// Types for permission logic
import { Snowflake } from "discord-api-types/globals";

// Both allow and deny for targets that have them - just a representation to pass between functions
interface PermissionAllowAndDenyData {
  allow: number;
  deny: number;
}

// The data that's stored for a guild
interface GuildPermissionData {
  roles: {
    [roleId: Snowflake]: number;
  };
  users: {
    [userId: Snowflake]: PermissionAllowAndDenyData;
  };
}

// Data that's stored for a channel
interface ChannelPermissionData {
  roles: {
    [roleId: Snowflake]: PermissionAllowAndDenyData;
  };

  users: {
    [userId: Snowflake]: PermissionAllowAndDenyData;
  };
}

// Results after permissions calcuation
interface PresentBotPermissionResult {
  allPresent: true;
  present: number[];
}

interface MissingBotPermissionsResult {
  allPresent: false;
  missing: number[];
  present: number[];
}

type BotPermissionResult =
  | PresentBotPermissionResult
  | MissingBotPermissionsResult;

// Result after discord permissions calculation - only difference from above it bigint instead of number
interface PresentDiscordPermissionResult {
  allPresent: true;
  present: bigint[];
}

interface MissingDiscordPermissionsResult {
  allPresent: false;
  missing: bigint[];
  present: bigint[];
}

type DiscordPermissionResult =
  | PresentDiscordPermissionResult
  | MissingDiscordPermissionsResult;

export {
  BotPermissionResult,
  ChannelPermissionData,
  DiscordPermissionResult,
  GuildPermissionData,
  MissingBotPermissionsResult,
  MissingDiscordPermissionsResult,
  PermissionAllowAndDenyData,
  PresentBotPermissionResult,
  PresentDiscordPermissionResult,
};
