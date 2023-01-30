// Context menu command that returns a representation of the message
// Can be used on any message
import {
  APIEmbed,
  APIInteractionResponseChannelMessageWithSource,
  APIMessage,
  APIMessageApplicationCommandGuildInteraction,
  APIMessageComponent,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import { FormDataEncoder } from "form-data-encoder";
import { Blob, FormData } from "formdata-node";
import { Readable } from "stream";

import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../../errors";
import { GuildSession } from "../../../lib/session";
import { InternalInteractionType } from "../../interaction";
import { InteractionReturnData } from "../../types";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function handleFetchMessageCommand(
  internalInteraction: InternalInteractionType<APIMessageApplicationCommandGuildInteraction>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  session: GuildSession,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  // Returns the content of the message in a txt file format
  const messageId = interaction.data.target_id;
  const message = interaction.data.resolved.messages[messageId] as
    | APIMessage
    | undefined;
  if (message === undefined) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_RESOLVED_MISSING_EXPECTED_VALUE,
      "Message not found in resolved data"
    );
  }

  // Generate formdata to respond with file
  // JSON if more than just content on the message
  // otherwise TXT
  const form = new FormData();
  let isJson = false;
  if (
    message.content.length < 1 &&
    message.embeds.length < 1 &&
    (message.components?.length ?? 0) < 1
  ) {
    // Message doesn't have anything that we can return
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: "This message has no content, embeds or components",
        flags: MessageFlags.Ephemeral,
      },
    };
  } else if (
    message.embeds.length > 0 ||
    (message.components?.length ?? 0) < 1
  ) {
    // Message has embeds or components in addition to possibly content
    // JSON format
    interface FileData {
      content?: string;
      embeds?: APIEmbed[];
      components?: APIMessageComponent[];
    }
    const fileData: FileData = {};
    if (message.content.length > 0) {
      fileData.content = message.content;
    }
    if ((message.components?.length ?? 0) < 1) {
      fileData.components = message.components;
    }
    if (message.embeds.length > 0) {
      fileData.embeds = message.embeds;
    }
    // Add file to formdata
    form.set(
      "files[0]",
      new Blob([JSON.stringify(fileData, undefined, 2)], {
        type: "application/json",
      }),
      "message.json"
    );
    isJson = true;
  } else {
    // Message has content and no embeds or components
    // TXT format
    // Add file to formdata
    form.set(
      "files[0]",
      new Blob([message.content], {
        type: "text/plain",
      }),
      "message.txt"
    );
    isJson = false;
  }

  // Message to send with file
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
          description: "A representation of the message", // Accessible to screen readers
        },
      ],
      flags: MessageFlags.Ephemeral,
    },
  };
  // Set message to send with file (payload_json)
  form.set(
    "payload_json",
    new Blob([JSON.stringify(messageData)], {
      type: "application/json",
    }),
    "" // empty string for filename is required for discord to accept this as the
    // payload (otherwise form-data adds a filename of "blob" and discord doesn't recognize it as the payload)
  );
  // Encode formdata to return
  const encoder = new FormDataEncoder(form);

  return {
    headers: encoder.headers,
    body: Readable.from(encoder.encode()),
  };
}
