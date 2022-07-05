import { Snowflake } from "discord-api-types/globals";
import {
  RESTGetAPIApplicationGuildCommandsResult,
  Routes,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import toSetCommands from "../../discord_commands/guildAddMessage.json" assert { type: "json" };
async function registerAddCommand(
  guildId: Snowflake,
  instance: FastifyInstance
) {
  const commands = (await instance.restClient.get(
    Routes.applicationGuildCommands(instance.envVars.DISCORD_CLIENT_ID, guildId)
  )) as RESTGetAPIApplicationGuildCommandsResult;
  // For each command in required commands, ensure that it is already registered
  let shouldRegister = false;
  for (const command of toSetCommands) {
    if (
      !commands.find((c) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        c.name === command.name && c.type === command.type;
      })
    ) {
      shouldRegister = true;
    }
  }
  if (shouldRegister) {
    await instance.restClient.put(
      Routes.applicationGuildCommands(
        instance.envVars.DISCORD_CLIENT_ID,
        guildId
      ),
      { body: toSetCommands }
    );
  }
}
export { registerAddCommand };
