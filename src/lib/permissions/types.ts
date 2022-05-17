import { Snowflake } from "discord-api-types/globals";

interface PermissionAllowAndDenyData {
  allow: number;
  deny: number;
}

interface GuildPermissionData {
  roles: {
    [roleId: Snowflake]: number;
  };
  users: {
    [userId: Snowflake]: PermissionAllowAndDenyData;
  };
}

interface ChannelPermissionData {
  roles: {
    [roleId: Snowflake]: PermissionAllowAndDenyData;
  };

  users: {
    [userId: Snowflake]: PermissionAllowAndDenyData;
  };
}

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
