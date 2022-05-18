import { APIEmbed, APIEmbedField } from "discord-api-types/v9";

import { embedPink, failureRed } from "../../constants";

enum ActionType {
  GENERAL = embedPink,
  DESTRUCTIVE = failureRed,
}

const createLoggingEmbed = ({
  title,
  description,
  fields,
  actionBy,
  actionType,
}: {
  title: string;
  description: string;
  fields: APIEmbedField[];
  actionBy: string;
  actionType: ActionType;
}): APIEmbed => {
  const embed = {
    title,
    description,
    fields,
    color: actionType,
    timestamp: new Date().toISOString(),
  };

  embed.fields.push({
    name: "Action By",
    value: `<@${actionBy}>`,
  });

  return embed;
};

export { ActionType, createLoggingEmbed };
