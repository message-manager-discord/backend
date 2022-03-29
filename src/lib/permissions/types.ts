import { Snowflake } from "discord-api-types/v9";

enum Permission {
  NONE = 0,
  VIEW_MESSAGES,
  EDIT_MESSAGES,
  SEND_MESSAGES,
  DELETE_MESSAGES,
}

interface PermissionsData {
  roles?: Record<Snowflake, Permission>;
  users?: Record<Snowflake, Permission>;
}
export { Permission, PermissionsData };
