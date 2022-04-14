import { Snowflake } from "discord-api-types/globals";
import { FastifyInstance } from "fastify";
import { RESTGetAPIApplicationGuildCommandsResult } from "discord-api-types/v9";
import command from "../../discord_commands/guildAddMessage.json" assert { type: "json" };
async function registerAddCommand(
  guildId: Snowflake,
  instance: FastifyInstance
) {
  const commands = (await instance.restClient.fetchApplicationGuildCommands(
    instance.envVars.DISCORD_CLIENT_ID,
    guildId
  )) as RESTGetAPIApplicationGuildCommandsResult;
  if (
    commands.find(
      (cmd) => cmd.name === command.name && cmd.type === command.type
    )
  ) {
    return; // The command is already registered
  }

  await instance.restClient.createApplicationGuildCommand(
    instance.envVars.DISCORD_CLIENT_ID,
    guildId,

    // @ts-expect-error The client does not accept / is not updated to include message commands. However it should still work
    command
  );
}
export { registerAddCommand };
