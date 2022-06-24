import { Snowflake } from "discord-api-types/globals";
import {
  RESTGetAPIApplicationGuildCommandsResult,
  Routes,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import command from "../../discord_commands/guildAddMessage.json" assert { type: "json" };
async function registerAddCommand(
  guildId: Snowflake,
  instance: FastifyInstance
) {
  const commands = (await instance.restClient.get(
    Routes.applicationGuildCommands(instance.envVars.DISCORD_CLIENT_ID, guildId)
  )) as RESTGetAPIApplicationGuildCommandsResult;
  if (
    commands.find(
      (cmd) => cmd.name === command.name && cmd.type === command.type
    )
  ) {
    return; // The command is already registered
  }

  await instance.restClient.post(
    Routes.applicationGuildCommands(
      instance.envVars.DISCORD_CLIENT_ID,
      guildId
    ),
    { body: command }
  );
}
export { registerAddCommand };
