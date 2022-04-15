import {
  APIInteractionGuildMember,
  APIMessage,
  Snowflake,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import { ExpectedFailure, InteractionOrRequestFinalStatus } from "../../errors";
import { checkDefaultDiscordPermissionsPresent } from "../permissions/discordChecks";
import { checkAllPermissions } from "../permissions/checks";
import { Permission } from "../permissions/types";
import { getChannelPermissions, getGuildPermissions } from "../permissions/get";
import { registerAddCommand } from "../applicationCommands/registerHelper";

interface GetMessageActionsPossibleOptions {
  message: APIMessage;
  user: APIInteractionGuildMember;
  instance: FastifyInstance;
  guildId: Snowflake;
}

interface GetMessageActionsPossibleResult {
  view: boolean;
  edit: boolean;
  delete: boolean;
}

async function getMessageActionsPossible({
  message,
  user,
  instance,
  guildId,
}: GetMessageActionsPossibleOptions): Promise<GetMessageActionsPossibleResult> {
  // Check if the user has the correct permissions
  const channelId = message.channel_id;

  const { idOrParentId } = await checkDefaultDiscordPermissionsPresent({
    instance,
    user,
    guildId,
    channelId,
  });
  const guildPermissions = await getGuildPermissions(guildId, instance);
  const channelPermissions = await getChannelPermissions(
    idOrParentId,
    instance
  );

  const allowedData = {
    edit: checkAllPermissions({
      roles: user.roles,
      userId: user.user.id,
      guildPermissions,
      channelPermissions,
      permission: Permission.EDIT_MESSAGES,
    }),
    delete: checkAllPermissions({
      roles: user.roles,
      userId: user.user.id,
      guildPermissions,
      channelPermissions,
      permission: Permission.DELETE_MESSAGES,
    }),

    view: checkAllPermissions({
      roles: user.roles,
      userId: user.user.id,
      guildPermissions,
      channelPermissions,
      permission: Permission.VIEW_MESSAGES,
    }),
  };

  const databaseMessage = await instance.prisma.message.findFirst({
    where: { id: BigInt(message.id) },
    // Don't need to worry about ordering as all we want to do is check that this message has been sent by the bot before
  });
  if (!databaseMessage) {
    const guild = await instance.prisma.guild.findUnique({
      where: { id: BigInt(guildId) },
    });
    // eslint-disable-next-line no-constant-condition
    if (guild?.beforeMigration) {
      // If guild has not had command registered, register it
      if (
        !(await instance.redisCache.getGuildMigrationCommandRegistered(guildId))
      ) {
        await registerAddCommand(guildId, instance);
        throw new ExpectedFailure(
          InteractionOrRequestFinalStatus.MESSAGE_NOT_FOUND_IN_DATABASE_MIGRATION_POSSIBLE,
          'That message was not sent via the bot! Try using the "Add Message" context menu command (for more info check out `/info migration`)'
        );
      }
    }
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MESSAGE_NOT_FOUND_IN_DATABASE,
      "That message was not sent via the bot!"
    );
  }

  return allowedData;
}
export { getMessageActionsPossible };
