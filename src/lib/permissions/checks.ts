import { GuildSession } from "../session";

// Wrapper around gateway logic for comparing role positions
// Role positions are important as users must have a higher role than another user to be able
// to perform certain actions on them
const checkIfRoleIsBelowUsersHighestRole = async ({
  session,
  roleId,
}: {
  session: GuildSession;
  roleId: string;
}): Promise<boolean> => {
  return await (
    await session.cachedGuild
  ).checkIfRoleIsLowerThanUsersRole(roleId, session.userRoles, session.userId);
};

export { checkIfRoleIsBelowUsersHighestRole };
