class MissingAccessBase extends Error {}
class UserMissingBotAccess extends MissingAccessBase {
  // When the user is missing permissions on the bot permission system
}
class BotMissingAccess extends MissingAccessBase {
  // Discord Bot missing Discord permissions
}
class UserMissingAccess extends MissingAccessBase {
  // User missing Discord permissions
}

class ExceededMessageLimit extends Error {}
class ChannelNotFoundError extends Error {}
export {
  ExceededMessageLimit,
  ChannelNotFoundError,
  UserMissingBotAccess,
  BotMissingAccess,
  UserMissingAccess,
  MissingAccessBase,
};
