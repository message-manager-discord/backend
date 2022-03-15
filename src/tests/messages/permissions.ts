import tap from "tap";
import {
  checkAllPermissions,
  Permission,
  PermissionsData,
} from "../../lib/messages/permissions";

const userId = "12587";
const roles = ["1", "2", "5", "8", "10"];

tap.test("Test undefined or empty permissions", (childTest) => {
  childTest.equal(
    checkAllPermissions({
      roles,
      userId,
      channelPermissions: undefined,
      guildPermissions: undefined,
      permission: Permission.SEND_MESSAGES,
    }),
    false
  );
  const channelPermissions: PermissionsData = {
    roles: {},
    users: {},
  };
  const guildPermissions: PermissionsData = {
    roles: {},
    users: {},
  };
  childTest.equal(
    checkAllPermissions({
      roles,
      userId,
      channelPermissions,
      guildPermissions,
      permission: Permission.SEND_MESSAGES,
    }),
    false
  );
  childTest.end();
});

tap.test(
  "Test that permissions granted on a guild, role level work",
  (childTest) => {
    const channelPermissions: PermissionsData = {
      roles: {},
      users: {},
    };
    const guildPermissions: PermissionsData = {
      roles: {
        1: Permission.NONE,
        2: Permission.NONE,
        5: Permission.SEND_MESSAGES,
        8: Permission.SEND_MESSAGES,
        10: Permission.EDIT_MESSAGES,
      },
      users: {},
    };
    childTest.equal(
      checkAllPermissions({
        roles,
        userId,
        channelPermissions,
        guildPermissions,
        permission: Permission.SEND_MESSAGES,
      }),
      true
    );
    childTest.equal(
      checkAllPermissions({
        roles,
        userId,
        channelPermissions,
        guildPermissions,
        permission: Permission.EDIT_MESSAGES,
      }),
      true
    );
    childTest.equal(
      checkAllPermissions({
        roles,
        userId,
        channelPermissions,
        guildPermissions,
        permission: Permission.DELETE_MESSAGES,
      }),
      false
    );
    childTest.end();
  }
);

tap.test(
  "Test when permissions are denied on roles, but are granted on user basis",
  (childTest) => {
    const channelPermissions: PermissionsData = {
      roles: {},
      users: {},
    };
    const guildPermissions: PermissionsData = {
      roles: {
        1: Permission.NONE,
      },
      users: {
        12587: Permission.SEND_MESSAGES,
      },
    };
    childTest.equal(
      checkAllPermissions({
        roles,
        userId,
        channelPermissions,
        guildPermissions,
        permission: Permission.SEND_MESSAGES,
      }),
      true
    );
    childTest.end();
  }
);

tap.test(
  "Test when permissions are granted on role, but denied on user, the permission is denied",
  (childTest) => {
    const channelPermissions: PermissionsData = {
      roles: {},
      users: {},
    };
    const guildPermissions: PermissionsData = {
      roles: {
        1: Permission.SEND_MESSAGES,
      },
      users: {
        12587: Permission.NONE,
      },
    };
    childTest.equal(
      checkAllPermissions({
        roles,
        userId,
        channelPermissions,
        guildPermissions,
        permission: Permission.SEND_MESSAGES,
      }),
      false
    );
    childTest.end();
  }
);

tap.test(
  "Test when permissions are granted on a guild level, but denied on a channel level",
  (childTest) => {
    const channelPermissions: PermissionsData = {
      roles: {},
      users: { 12587: Permission.NONE },
    };
    const guildPermissions: PermissionsData = {
      roles: {
        1: Permission.SEND_MESSAGES,
      },
      users: {},
    };
    childTest.equal(
      checkAllPermissions({
        roles,
        userId,
        channelPermissions,
        guildPermissions,
        permission: Permission.SEND_MESSAGES,
      }),
      false
    );
    childTest.end();
  }
);

tap.test(
  "Test when permissions are granted on a channel level, but denied on a guild level",
  (childTest) => {
    const channelPermissions: PermissionsData = {
      roles: { 1: Permission.SEND_MESSAGES },
      users: {},
    };
    const guildPermissions: PermissionsData = {
      roles: {
        1: Permission.NONE,
      },
      users: {},
    };
    childTest.equal(
      checkAllPermissions({
        roles,
        userId,
        channelPermissions,
        guildPermissions,
        permission: Permission.SEND_MESSAGES,
      }),
      true
    );
    childTest.end();
  }
);
