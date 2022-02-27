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
  GENERIC_EXPECTED_PERMISSIONS_FAILURE = 3000,
  USER_MISSING_DISCORD_PERMISSION,
  BOT_MISSING_DISCORD_PERMISSION,
  USER_MISSING_INTERNAL_BOT_PERMISSION,
  GENERIC_EXPECTED_LIMIT_FAILURE = 4000,
  EXCEEDED_CHANNEL_MESSAGE_LIMIT,
  GENERIC_UNEXPECTED_FAILURE = 5000,
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
}

class CustomError extends Error {
  status: InteractionOrRequestFinalStatus;
  constructor(status: InteractionOrRequestFinalStatus, message: string) {
    super(message);
    this.status = status;
  }
}

class ExpectedFailure extends CustomError {
  // status should be 2xxx
}

class ExpectedPermissionFailure extends CustomError {
  // status should be 3xxx
}

class LimitHit extends CustomError {
  // status should be 4xxx
}

class UnexpectedFailure extends CustomError {
  // status should be 5xxx
}

export {
  InteractionOrRequestFinalStatus,
  ExpectedFailure,
  ExpectedPermissionFailure,
  LimitHit,
  UnexpectedFailure,
  CustomError,
};
