import { APIMessageComponent } from "discord-api-types/v9";

enum InteractionOrRequestFinalStatus {
  /*
   * 1xxx - The interaction was a success
   * 2xxx - The interaction failed but the failure is to be expected
   * 3xxx - The interaction failed but the failure is to be expected and related to permissions
   * 4xxx - The interaction failed but the failure is to be expected and related to a limit
   * 5xxx - The interaction failed and was not expected
   */

  SUCCESS = 1000,
  GENERIC_EXPECTED_FAILURE = 2000,
  CHANNEL_NOT_FOUND_IN_CACHE,
  DM_INTERACTION_RECEIVED_WHEN_SHOULD_BE_GUILD_ONLY,
  MESSAGE_AUTHOR_NOT_BOT_AUTHOR,
  MESSAGE_NOT_FOUND_IN_DATABASE,
  MESSAGE_NOT_FOUND_IN_DATABASE_MIGRATION_POSSIBLE,
  MESSAGE_ALREADY_MIGRATED,
  MIGRATION_ATTEMPTED_ON_MESSAGE_SENT_AFTER_MIGRATION_DATE,
  MIGRATION_ATTEMPTED_ON_NON_STANDARD_MESSAGE,
  USER_REQUIRED_TO_BE_SIGNED_IN,
  MESSAGE_DELETED_DURING_ACTION,
  MAX_SPAM_REPORTS_PER_MONTH_REACHED,
  REPORT_ALREADY_SUBMITTED,
  BOT_FOUND_WHEN_USER_EXPECTED,
  NO_PERMISSION_TO_REMOVE,
  TAG_NOT_FOUND,
  NO_PERMISSIONS_PRESET_SELECTED,
  MANAGEMENT_PERMISSIONS_CANNOT_BE_SET_ON_CHANNEL_LEVEL,
  GENERIC_EXPECTED_PERMISSIONS_FAILURE = 3000,
  USER_MISSING_DISCORD_PERMISSION,
  BOT_MISSING_DISCORD_PERMISSION,
  USER_MISSING_INTERNAL_BOT_PERMISSION,
  BOT_MISSING_DISCORD_SCOPE,
  USER_ROLES_NOT_HIGH_ENOUGH,
  USER_ATTEMPTED_TO_EDIT_PERMISSION_ABOVE_THEIR_PERMISSION,
  GENERIC_EXPECTED_OAUTH_FAILURE = 4000,
  OATUH_TOKEN_EXPIRED,
  GENERIC_EXPECTED_LIMIT_FAILURE = 5000,
  MAX_ROLE_PERMISSIONS,
  MAX_USER_PERMISSIONS,
  MAX_ROLE_CHANNEL_PERMISSIONS,
  MAX_USER_CHANNEL_PERMISSIONS,
  GENERIC_UNEXPECTED_FAILURE = 6000,
  INTERACTION_TYPE_MISSING_HANDLER,
  APPLICATION_COMMAND_TYPE_MISSING_HANDLER,
  APPLICATION_COMMAND_MISSING_HANDLER,
  MODAL_CUSTOM_ID_NOT_FOUND,
  MODAL_CUSTOM_ID_MALFORMED,
  CHANNEL_NOT_FOUND_DISCORD_HTTP,
  MISSING_PERMISSIONS_DISCORD_HTTP_SEND_MESSAGE,
  APPLICATION_COMMAND_MISSING_EXPECTED_OPTION,
  APPLICATION_COMMAND_RESOLVED_MISSING_EXPECTED_VALUE,
  APPLICATION_COMMAND_UNEXPECTED_SUBCOMMAND,
  MODAL_SUBMIT_MISSING_REQUIRED_INPUT,
  GUILD_UNAVAILABLE_BUT_SENDING_INTERACTIONS,
  COMPONENT_CUSTOM_ID_NOT_FOUND,
  COMPONENT_CUSTOM_ID_MALFORMED,
  GUILD_COMPONENT_IN_DM_INTERACTION,
  OAUTH_REQUEST_FAILED,
  CREATE_WEBHOOK_RESULT_MISSING_TOKEN,
  ROLE_NOT_IN_CACHE,
  PERMISSIONS_CANNOT_CROSSOVER_WHEN_UPDATING,
}

class CustomError extends Error {
  status: InteractionOrRequestFinalStatus;
  components: APIMessageComponent[]; // Won't do anything if outside an interaction
  constructor(
    status: InteractionOrRequestFinalStatus,
    message: string,
    components: APIMessageComponent[] = []
  ) {
    super(message);
    this.status = status;
    this.components = components;
  }
}

class ExpectedFailure extends CustomError {
  // status should be 2xxx
}

class ExpectedPermissionFailure extends CustomError {
  // status should be 3xxx
}

class ExpectedOauth2Failure extends CustomError {
  // status should be 4xxx
}

class LimitHit extends CustomError {
  // status should be 5xxx
}

class UnexpectedFailure extends CustomError {
  // status should be 6xxx
}

export {
  CustomError,
  ExpectedFailure,
  ExpectedOauth2Failure,
  ExpectedPermissionFailure,
  InteractionOrRequestFinalStatus,
  LimitHit,
  UnexpectedFailure,
};
