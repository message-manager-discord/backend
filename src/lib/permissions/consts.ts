// Permission constants - for internal bot permissions
// Uses number bitflags

const InternalPermissions = Object.freeze({
  NONE: 0,
  VIEW_MESSAGES: 1 << 0,
  EDIT_MESSAGES: 1 << 1,
  SEND_MESSAGES: 1 << 2,
  DELETE_MESSAGES: 1 << 3,
  MANAGE_PERMISSIONS: 1 << 4,
  MANAGE_CONFIG: 1 << 5,
});

// Representations of permissions to be used in the bot - mainly to display info about permissions
interface InternalPermission {
  name: string;
  readableName: string;
  value: number;
  description: string;
  channelOverrideAllowed: boolean; // If the permission can be set as a channel override
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

// Array of all permissions that are valid
const UsableInternalPermissionValues = Object.freeze(
  UsableInternalPermissions.map((permission) => permission.value)
);

// Combine all permissions using bitwise or (=|) (bitflag has all permissions set)
const AllInternalPermissions = Object.values(InternalPermissions).reduce(
  (permissions: number, permission: number) => permissions | permission,
  InternalPermissions.NONE
);

// Map of permission names to values - to be used to lookup from either way
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

// Parse a bitfield value for all the permissions it has
const getAllPermissionsInValue = (permission: number): number[] => {
  const permissions: number[] = [];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const [key, value] of Object.entries(_permissionsByName)) {
    if ((permission & value) === value) {
      permissions.push(value);
    }
  }
  return permissions;
};

// Same as above but then gets names
const getAllPermissionsAsNameInValue = (permission: number): string[] => {
  return parseInternalPermissionValuesToStringNames(
    getAllPermissionsInValue(permission)
  );
};

export {
  AllInternalPermissions,
  getAllPermissionsAsNameInValue,
  getAllPermissionsInValue,
  getInternalPermissionByName,
  getInternalPermissionByValue,
  InternalPermissions,
  parseInternalPermissionValuesToStringNames,
  UsableInternalPermissions,
  UsableInternalPermissionValues,
};
