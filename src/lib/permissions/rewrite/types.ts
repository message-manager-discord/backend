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

export {
  PermissionAllowAndDenyData,
  GuildPermissionData,
  ChannelPermissionData,
};
