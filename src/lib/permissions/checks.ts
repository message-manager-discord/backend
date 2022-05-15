import { GuildSession } from "../session";

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
