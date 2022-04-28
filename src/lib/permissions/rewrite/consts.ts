const InternalPermissions = Object.freeze({
  NONE: 0,
  VIEW_MESSAGES: 1 << 0,
  EDIT_MESSAGES: 1 << 1,
  SEND_MESSAGES: 1 << 2,
  DELETE_MESSAGES: 1 << 3,
  MANAGE_PERMISSIONS: 1 << 4,
  MANAGE_CONFIG: 1 << 5,
});

// Combine using bitwise or (=|)
const AllInternalPermissions = Object.values(InternalPermissions).reduce(
  (permissions: number, permission: number) => permissions | permission,
  InternalPermissions.NONE
);

export { InternalPermissions, AllInternalPermissions };
