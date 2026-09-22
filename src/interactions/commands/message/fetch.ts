// Context menu command that returns a representation of the message
// Can be used on any message
import type {
  APIEmbed,
  APIMessage,
  APIMessageApplicationCommandGuildInteraction,
  APIMessageComponent,
  RESTPatchAPIInteractionOriginalResponseJSONBody,
} from "discord-api-types/v9";
import { InteractionResponseType, MessageFlags } from "discord-api-types/v9";
import type { FastifyInstance } from "fastify";
import { FormDataEncoder } from "form-data-encoder";
import { Blob, FormData } from "formdata-node";
import { Readable } from "stream";

import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../../errors.js";
import type { GuildSession } from "../../../lib/session/index.js";
import type { InternalInteractionType } from "../../interaction.js";
import type { InteractionReturnData } from "../../types.js";

// eslint-disable-next-line @typescript-eslint/require-await
export default async function handleFetchMessageCommand(
  internalInteraction: InternalInteractionType<APIMessageApplicationCommandGuildInteraction>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  session: GuildSession,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  instance: FastifyInstance,
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  // Returns the content of the message in a txt file format
  const messageId = interaction.data.target_id;
  const message = interaction.data.resolved.messages[messageId] as
    APIMessage | undefined;
  if (message === undefined) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.APPLICATION_COMMAND_RESOLVED_MISSING_EXPECTED_VALUE,
      "Message not found in resolved data",
    );
  }

  return {
    returnData: {
      type: InteractionResponseType.DeferredChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
      },
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    callback: async () => {
      // Generate formdata to respond with file
      // JSON if more than just content on the message
      // otherwise TXT
      const form = new FormData();

      const hasEmbeds = message.embeds.length > 0;
      const hasComponents = (message.components?.length ?? 0) > 0;
      const hasContent = message.content.length > 0;

      if (!hasContent && !hasEmbeds && !hasComponents) {
        // Ephemeral is inherited from the deferred response, so no flags needed
        return {
          content: "This message has no content, embeds or components",
        };
      }

      const isJson = hasEmbeds || hasComponents;

      if (isJson) {
        interface FileData {
          content?: string;
          embeds?: APIEmbed[];
          components?: APIMessageComponent[];
        }

        const fileData: FileData = {};

        if (hasContent) {
          fileData.content = message.content;
        }

        if (hasEmbeds) {
          fileData.embeds = message.embeds;
        }

        if (hasComponents) {
          fileData.components = message.components;
        }

        form.set(
          "files[0]",
          new Blob([JSON.stringify(fileData, undefined, 2)], {
            type: "application/json",
          }),
          "message.json",
        );
      } else {
        form.set(
          "files[0]",
          new Blob([message.content], {
            type: "text/plain",
          }),
          "message.txt",
        );
      }

      // Message to send with file (this is an edit of the deferred response)
      const messageData: RESTPatchAPIInteractionOriginalResponseJSONBody = {
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
      };
      // Set message to send with file (payload_json)
      form.set(
        "payload_json",
        new Blob([JSON.stringify(messageData)], {
          type: "application/json",
        }),
        "", // empty string for filename is required for discord to accept this as the
        // payload (otherwise form-data adds a filename of "blob" and discord doesn't recognize it as the payload)
      );
      // Encode formdata to return
      const encoder = new FormDataEncoder(form);

      return {
        headers: encoder.headers,
        body: Readable.from(encoder.encode()),
      };
    },
  };
}
