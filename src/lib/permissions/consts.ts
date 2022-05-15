const InternalPermissions = Object.freeze({
  NONE: 0,
  VIEW_MESSAGES: 1 << 0,
  EDIT_MESSAGES: 1 << 1,
  SEND_MESSAGES: 1 << 2,
  DELETE_MESSAGES: 1 << 3,
  MANAGE_PERMISSIONS: 1 << 4,
  MANAGE_CONFIG: 1 << 5,
});

interface InternalPermission {
  name: string;
  readableName: string;
  value: number;
  description: string;
  channelOverrideAllowed: boolean;
}

const UsableInternalPermissions: readonly InternalPermission[] = Object.freeze([
  {
    name: "VIEW_MESSAGES",
    readableName: "View Messages",
    value: InternalPermissions.VIEW_MESSAGES,
    description: "Grants access to view messages, currently has no effect",
    channelOverrideAllowed: true,
  },
  {
    name: "EDIT_MESSAGES",
    readableName: "Edit Messages",
    value: InternalPermissions.EDIT_MESSAGES,
    description:
      "Grants access to editing messages previously sent via the bot account",
    channelOverrideAllowed: true,
  },
  {
    name: "SEND_MESSAGES",
    readableName: "Send Messages",
    value: InternalPermissions.SEND_MESSAGES,
    description: "Grants access to sending messages via the bot account",
    channelOverrideAllowed: true,
  },
  {
    name: "DELETE_MESSAGES",
    readableName: "Delete Messages",
    value: InternalPermissions.DELETE_MESSAGES,
    description:
      "Grants access to deleting messages previously sent via the bot account",
    channelOverrideAllowed: true,
  },
  {
    name: "MANAGE_PERMISSIONS",
    readableName: "Manage Permissions",
    value: InternalPermissions.MANAGE_PERMISSIONS,
    description:
      "Grants access to managing bot permissions for users and roles. Doesn't effect discord permissions.",
    channelOverrideAllowed: false,
  },
  {
    name: "MANAGE_CONFIG",
    readableName: "Manage Config",
    value: InternalPermissions.MANAGE_CONFIG,
    description: "Grants access to managing the bot's configuration",
    channelOverrideAllowed: false,
  },
]);

const UsableInternalPermissionValues = Object.freeze(
  UsableInternalPermissions.map((permission) => permission.value)
);

// Combine using bitwise or (=|)
const AllInternalPermissions = Object.values(InternalPermissions).reduce(
  (permissions: number, permission: number) => permissions | permission,
  InternalPermissions.NONE
);

const _permissionsByName: { [name: string]: number } = {};
const _permissionsByValue: { [value: number]: string } = {};
// Find the names and values of all the permissions from Permissions

for (const [key, value] of Object.entries(InternalPermissions)) {
  _permissionsByName[key] = value;
  _permissionsByValue[value] = key;
}

const getInternalPermissionByName = (name: string): number | undefined => {
  return _permissionsByName[name];
};

const getInternalPermissionByValue = (value: number): string | undefined => {
  return _permissionsByValue[value];
};

const parseInternalPermissionValuesToStringNames = (
  permissions: number[] | readonly number[]
): string[] => {
  const parsed = permissions.map((permission) => {
    const permissionString = getInternalPermissionByValue(permission);
    if (permissionString !== undefined) {
      return permissionString;
    }
    return undefined;
  });
  return parsed.filter((permission) => permission !== undefined) as string[];
};

export {
  InternalPermissions,
  AllInternalPermissions,
  UsableInternalPermissions,
  UsableInternalPermissionValues,
  getInternalPermissionByName,
  getInternalPermissionByValue,
  parseInternalPermissionValuesToStringNames,
};
