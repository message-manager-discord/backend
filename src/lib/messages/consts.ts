// Required permission constants - in the form of arrays of bitfields
import { DiscordPermissions } from "../../consts";

const requiredPermissionsEdit = [DiscordPermissions.VIEW_CHANNEL];
const requiredPermissionsDelete = requiredPermissionsEdit;
const requiredPermissionsSendBot = [
  ...requiredPermissionsEdit,
  DiscordPermissions.SEND_MESSAGES,
  DiscordPermissions.ATTACH_FILES,
  DiscordPermissions.EMBED_LINKS,
];
const requiredPermissionsSendBotThread = [
  ...requiredPermissionsSendBot,
  DiscordPermissions.SEND_MESSAGES_IN_THREADS,
];
const requiredPermissionsSendUser = requiredPermissionsEdit;

export {
  requiredPermissionsDelete,
  requiredPermissionsEdit,
  requiredPermissionsSendBot,
  requiredPermissionsSendBotThread,
  requiredPermissionsSendUser,
};
