// https://github.com/detritusjs/client/blob/b27cbaa5bfb48506b059be178da0e871b83ba95e/src/constants.ts#L917
const DiscordPermissions = Object.freeze({
  NONE: 0n,
  CREATE_INSTANT_INVITE: 1n << 0n,
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
  ADD_REACTIONS: 1n << 6n,
  VIEW_AUDIT_LOG: 1n << 7n,
  PRIORITY_SPEAKER: 1n << 8n,
  STREAM: 1n << 9n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  SEND_TTS_MESSAGES: 1n << 12n,
  MANAGE_MESSAGES: 1n << 13n,
  EMBED_LINKS: 1n << 14n,
  ATTACH_FILES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  MENTION_EVERYONE: 1n << 17n,
  USE_EXTERNAL_EMOJIS: 1n << 18n,
  VIEW_GUILD_ANALYTICS: 1n << 19n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
  MUTE_MEMBERS: 1n << 22n,
  DEAFEN_MEMBERS: 1n << 23n,
  MOVE_MEMBERS: 1n << 24n,
  USE_VAD: 1n << 25n,
  CHANGE_NICKNAME: 1n << 26n,
  CHANGE_NICKNAMES: 1n << 27n,
  MANAGE_ROLES: 1n << 28n,
  MANAGE_WEBHOOKS: 1n << 29n,
  MANAGE_EMOJIS: 1n << 30n,
  USE_APPLICATION_COMMANDS: 1n << 31n,
  REQUEST_TO_SPEAK: 1n << 32n,
  MANAGE_EVENTS: 1n << 33n,
  MANAGE_THREADS: 1n << 34n,
  USE_PUBLIC_THREADS: 1n << 35n,
  USE_PRIVATE_THREADS: 1n << 36n,
  USE_EXTERNAL_STICKERS: 1n << 37n,
  SEND_MESSAGES_IN_THREADS: 1n << 38n,
});

const _permissionsByName: { [name: string]: bigint } = {};
const _permissionsByValue: { [value: string]: string } = {};
// Find the names and values of all the permissions from Permissions

for (const [key, value] of Object.entries(DiscordPermissions)) {
  _permissionsByName[key] = value;
  _permissionsByValue[value.toString()] = key;
}

const getDiscordPermissionByName = (name: string): bigint | undefined => {
  return _permissionsByName[name];
};

const getDiscordPermissionByValue = (value: bigint): string | undefined => {
  return _permissionsByValue[value.toString()];
};

const parseDiscordPermissionValuesToStringNames = (
  permissions: bigint[]
): string[] => {
  const parsed = permissions.map((permission) => {
    return getDiscordPermissionByValue(permission);
  });
  return parsed.filter((permission) => permission !== undefined) as string[];
};
export {
  DiscordPermissions,
  getDiscordPermissionByName,
  getDiscordPermissionByValue,
  parseDiscordPermissionValuesToStringNames,
};
