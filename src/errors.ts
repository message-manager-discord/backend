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
  USER_REQUIRED_TO_BE_SIGNED_IN,
  MESSAGE_DELETED_DURING_ACTION,
  MAX_SPAM_REPORTS_PER_MONTH_REACHED,
  REPORT_ALREADY_SUBMITTED,
  BOT_FOUND_WHEN_USER_EXPECTED,
  NO_PERMISSION_TO_REMOVE,
  NO_MANAGEMENT_ROLE_TO_REMOVE,
  TAG_NOT_FOUND,
  GENERIC_EXPECTED_PERMISSIONS_FAILURE = 3000,
  USER_MISSING_DISCORD_PERMISSION,
  BOT_MISSING_DISCORD_PERMISSION,
  USER_MISSING_INTERNAL_BOT_PERMISSION,
  BOT_MISSING_DISCORD_SCOPE,
  USER_MISSING_INTERNAL_BOT_MANAGEMENT_PERMISSION,
  GENERIC_EXPECTED_OAUTH_FAILURE = 4000,
  OATUH_TOKEN_EXPIRED,
  GENERIC_EXPECTED_LIMIT_FAILURE = 5000,
  EXCEEDED_CHANNEL_MESSAGE_LIMIT,
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
  InteractionOrRequestFinalStatus,
  ExpectedFailure,
  ExpectedPermissionFailure,
  ExpectedOauth2Failure,
  LimitHit,
  UnexpectedFailure,
  CustomError,
};
