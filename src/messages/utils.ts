import { Message } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { Guild } from "redis-discord-cache";
import {
  ChannelNotFound,
  GuildNotFound,
  GuildUnavailable,
} from "redis-discord-cache/dist/errors";
import { MinimalChannel } from "redis-discord-cache/dist/structures/types";
import {
  ExpectedFailure,
  ExpectedPermissionFailure,
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../errors";

const getGuildChannelHandleErrors = async ({
  channelId,
  guild,
  instance,
}: {
  channelId: string;
  guild: Guild;
  instance: FastifyInstance;
}): Promise<MinimalChannel> => {
  let channel: MinimalChannel | null;

  try {
    channel = await guild.getChannel(channelId);
  } catch (e) {
    if (e instanceof GuildNotFound) {
      throw new ExpectedPermissionFailure(
        InteractionOrRequestFinalStatus.BOT_MISSING_DISCORD_SCOPE,
        `Guild ${guild.id} not cached. This is likely due to the bot missing the \`bot\` scope. Please reinvite the bot to fix this.`
      );
    } else if (e instanceof GuildUnavailable) {
      throw new UnexpectedFailure(
        InteractionOrRequestFinalStatus.GUILD_UNAVAILABLE_BUT_SENDING_INTERACTIONS,
        `Guild ${guild.id} is unavailable. This is likely due to the bot being offline. Please try again later, and if this error persists, please contact the bot developers.`
      );
    } else if (e instanceof ChannelNotFound) {
      throw new ExpectedPermissionFailure(
        InteractionOrRequestFinalStatus.BOT_MISSING_DISCORD_PERMISSION,
        `Channel ${channelId} not cached. This is likely due to the bot missing the \`VIEW_CHANNELS\` permission. Please make sure the bot has the correct permissions in that channel.`
      );
    } else {
      throw e;
    }
  }
  if (!channel) {
    throw new ExpectedPermissionFailure(
      InteractionOrRequestFinalStatus.BOT_MISSING_DISCORD_PERMISSION,
      `Channel ${channelId} not cached. This is likely due to the bot missing the \`VIEW_CHANNELS\` permission. Please make sure the bot has the correct permissions in that channel.` +
        "\nIf this channel is a thread, this could also be due to the bot either not having access to the thread, or the thread being archived. Please @mention the bot to fix this, if that is the case."
    );
  }
  return channel;
};

const checkDatabaseMessage = (message: Message | null): message is Message => {
  if (!message) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MESSAGE_NOT_FOUND_IN_DATABASE,
      "That message was not sent via the bot!"
    );
  }
  if (message.deleted) {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.MESSAGE_DELETED_DURING_ACTION,
      "That message was deleted during this action. Please dismiss all related messages."
    );
  }
  return true;
};
export { getGuildChannelHandleErrors, checkDatabaseMessage };
