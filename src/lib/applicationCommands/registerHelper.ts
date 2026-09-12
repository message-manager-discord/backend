// Register a context menu migration command to a specific guild
import type { Snowflake } from "discord-api-types/globals";
import type { RESTGetAPIApplicationGuildCommandsResult } from "discord-api-types/v9";
import { Routes } from "discord-api-types/v9";
import type { FastifyInstance } from "fastify";

import toSetCommands from "../../discord_commands/guildAddMessage.json" with { type: "json" };
async function registerAddCommand(
  guildId: Snowflake,
  instance: FastifyInstance,
) {
  const commands = (await instance.restClient.get(
    Routes.applicationGuildCommands(
      instance.envVars.DISCORD_CLIENT_ID,
      guildId,
    ),
  )) as RESTGetAPIApplicationGuildCommandsResult;
  // For each command in required commands, ensure that it is already registered
  // as it's better to check and not do anything in this case
  let shouldRegister = false;
  for (const command of toSetCommands) {
    if (
      !commands.some(
        (c) =>
          c.name === command.name && Number(c.type) === Number(command.type),
      )
    ) {
      shouldRegister = true;
    }
  }
  if (shouldRegister) {
    // Register the command
    await instance.restClient.put(
      Routes.applicationGuildCommands(
        instance.envVars.DISCORD_CLIENT_ID,
        guildId,
      ),
      { body: toSetCommands },
    );
  }
}
export { registerAddCommand };
