import {
  APIEmbed,
  APIInteractionResponseChannelMessageWithSource,
  APIMessageApplicationCommandGuildInteraction,
  APIMessageComponent,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../../errors";
import { InternalInteraction } from "../../interaction";

import { Blob, FormData } from "formdata-node";
import { Readable } from "stream";

import { FormDataEncoder } from "form-data-encoder";

import { InteractionReturnData } from "../../types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function handleFetchMessageCommand(
  internalInteraction: InternalInteraction<APIMessageApplicationCommandGuildInteraction>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  // Returns the content of the message in a txt file format
  const messageId = interaction.data.target_id;
  const message = interaction.data.resolved.messages[messageId];
  if (!message) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_RESOLVED_MISSING_EXPECTED_VALUE,
      "Message not found in resolved data"
    );
  }

  const form = new FormData();
  let isJson = false;
  if (!message.content && !message.embeds && !message.components) {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: "This message has no content, embeds or components",
        flags: MessageFlags.Ephemeral,
      },
    };
  } else if (
    (message.embeds && message.embeds.length > 0) ||
    (message.components && message.components.length > 0)
  ) {
    interface FileData {
      content?: string;
      embeds?: APIEmbed[];
      components?: APIMessageComponent[];
    }
    const fileData: FileData = {};
    if (message.content) {
      fileData.content = message.content;
    }
    if (message.components && message.components.length > 0) {
      fileData.components = message.components;
    }
    if (message.embeds && message.embeds.length > 0) {
      fileData.embeds = message.embeds;
    }
    form.set(
      "files[0]",
      new Blob([JSON.stringify(fileData, undefined, 2)], {
        type: "application/json",
      }),
      "message.json"
    );
    isJson = true;
  } else {
    form.set(
      "files[0]",
      new Blob([message.content], {
        type: "text/plain",
      }),
      "message.txt"
    );
    isJson = false;
  }

  const messageData: APIInteractionResponseChannelMessageWithSource = {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: isJson
        ? "Fetched the message! The content, embeds and components are available in the attached json file."
        : "Fetched the message! The content is available in the attached txt file.",
      attachments: [
        {
          id: "0",
          filename: `message.${isJson ? "json" : "txt"}`,
          description: "A representation of the message",
        },
      ],
      flags: MessageFlags.Ephemeral,
    },
  };
  form.set(
    "payload_json",
    new Blob([JSON.stringify(messageData)], {
      type: "application/json",
    }),
    "" // empty string for filename is required for discord to accept this as the payload (otherwise form-data adds a filename of "blob")
  );
  const encoder = new FormDataEncoder(form);

  return {
    headers: encoder.headers,
    body: Readable.from(encoder.encode()),
  };
}
