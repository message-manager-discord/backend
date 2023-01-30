// Shared logic for generating message generation embeds
// As this logic is used in multiple places, it is abstracted out
import { Snowflake } from "discord-api-types/globals";
import {
  APIActionRowComponent,
  APIEmbed,
  APIMessageActionRowComponent,
  APISelectMenuComponent,
  ButtonStyle,
  ComponentType,
} from "discord-api-types/v9";

import { embedPink } from "../../constants";
import {
  MessageSavedInCache,
  splitMessageCacheKey,
} from "../../lib/messages/cache";
import { addTipToEmbed } from "../../lib/tips";

type MessageGenerationButtonTypes =
  | "content"
  | "embed"
  | "send"
  | "edit"
  | "embed-metadata"
  | "select-fields"
  | "embed-footer"
  | "embed-content"
  | "embed-add-field"
  | "embed-author"
  | "embed-back"
  | "edit-embed-field"; // Potential types of buttons that can be used in the message generation flow

// Message generation key - so that the key is always the same format
const generateMessageGenerationCustomId = (
  messageGenerationKey: string,
  type: MessageGenerationButtonTypes,
  index?: number
): string => {
  return `message-generation:${messageGenerationKey}:${type}${
    index !== undefined ? `:${index}` : ""
  }`;
};

// Return interface
interface CreateMessageGenerationEmbedResult {
  embed: APIEmbed;
  components: APIActionRowComponent<APIMessageActionRowComponent>[];
}
// This will create an embed for the first screen - for editing either the content or the embed
// Also has a finish button (either send or edit)
const createInitialMessageGenerationEmbed = (
  messageGenerationKey: string,
  currentStatus: MessageSavedInCache,
  guildId: Snowflake
): CreateMessageGenerationEmbedResult => {
  const type = currentStatus.messageId === undefined ? "send" : "edit"; // Determine if we are sending or editing
  const channelId = splitMessageCacheKey(messageGenerationKey).channelId; // Get channel id from cache key
  const messageLink = `https://discord.com/channels/${guildId}/${channelId}/${
    currentStatus.messageId ?? ""
  }`; // generate message link
  return {
    embed: addTipToEmbed({
      title: `Message Generation Flow - ${
        type[0].toUpperCase() + type.slice(1)
      }`,
      description:
        `Use the buttons below to update the state of the message and embed. When you are done, click the ${type} button.` +
        `\nTo remove the embed, if you have not already done so, make sure all fields and other properties are removed (empty)` +
        "\n\n" +
        `${
          currentStatus.content !== undefined
            ? `**Current Content**: ${currentStatus.content ?? ""}`
            : ""
        }\n\n` +
        `${
          currentStatus.embed !== undefined
            ? "Embed exists, click the edit embed button to edit it."
            : ""
        }\n\n` +
        `${
          currentStatus.messageId !== undefined
            ? `[Jump to message being edited](${messageLink})`
            : ""
        }`,
      color: embedPink,
    }),
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            label: "Edit Content",
            style: ButtonStyle.Primary,
            custom_id: generateMessageGenerationCustomId(
              messageGenerationKey,
              "content"
            ),
          },
          {
            type: ComponentType.Button,
            label: "Edit Embed",
            style: ButtonStyle.Primary,
            custom_id: generateMessageGenerationCustomId(
              messageGenerationKey,
              "embed"
            ),
          },

          {
            type: ComponentType.Button,
            label: type[0].toUpperCase() + type.slice(1),
            style: ButtonStyle.Success,
            custom_id: generateMessageGenerationCustomId(
              messageGenerationKey,
              type
            ),
          },
        ],
      },
    ],
  };
};

// Second screen - for editing / adding an embed to a message
const createEmbedMessageGenerationEmbed = (
  messageGenerationKey: string,
  currentStatus: MessageSavedInCache
): CreateMessageGenerationEmbedResult => {
  let selectMenu: APIActionRowComponent<APISelectMenuComponent>;

  // Select menu for selecting which field to edit
  if (
    currentStatus.embed?.fields?.length !== undefined &&
    currentStatus.embed.fields.length > 0
  ) {
    selectMenu = {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.SelectMenu,
          placeholder: "Select a field to edit",
          custom_id: generateMessageGenerationCustomId(
            messageGenerationKey,
            "select-fields"
          ),
          max_values: 1,
          min_values: 1,
          options: currentStatus.embed.fields.map((field, index) => {
            console.log(field);
            return {
              label: field.name,
              value: index.toString(),
            };
          }),
        },
      ],
    };
  } else {
    // If no fields to edit display a placeholder option and disable the select menu
    selectMenu = {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.SelectMenu,
          placeholder: "Select a field to edit",
          custom_id: generateMessageGenerationCustomId(
            messageGenerationKey,
            "select-fields"
          ),
          max_values: 1,
          min_values: 1,
          options: [
            {
              label: "No fields to edit",
              value: "0",
              default: true,
            },
          ],
          disabled: true,
        },
      ],
    };
  }
  return {
    embed: addTipToEmbed({
      title: "Message Generation Flow - Embed",
      description:
        "Use the buttons below to update the state of the embed. When you are done, click the back button." +
        "\nTo remove the embed, if you have not already done so, make sure all fields and other properties are removed (empty)",
      color: embedPink,
    }),
    components: [
      // Each button will trigger a different modal and then call this function again
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            label: "Edit Metadata",
            style: ButtonStyle.Primary,
            custom_id: generateMessageGenerationCustomId(
              messageGenerationKey,
              "embed-metadata"
            ),
          },
          {
            type: ComponentType.Button,
            label: "Edit Content",
            style: ButtonStyle.Primary,
            custom_id: generateMessageGenerationCustomId(
              messageGenerationKey,
              "embed-content"
            ),
          },
          {
            type: ComponentType.Button,
            label: "Edit Footer",
            style: ButtonStyle.Primary,
            custom_id: generateMessageGenerationCustomId(
              messageGenerationKey,
              "embed-footer"
            ),
          },
          {
            type: ComponentType.Button,
            label: "Edit Author",
            style: ButtonStyle.Primary,
            custom_id: generateMessageGenerationCustomId(
              messageGenerationKey,
              "embed-author"
            ),
          },
          {
            type: ComponentType.Button,
            label: "Add Field",
            style: ButtonStyle.Primary,
            custom_id: generateMessageGenerationCustomId(
              messageGenerationKey,
              "embed-add-field"
            ),
          },
        ],
      },
      selectMenu,
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            label: "Save & Back",
            style: ButtonStyle.Success,
            custom_id: generateMessageGenerationCustomId(
              messageGenerationKey,
              "embed-back"
            ),
          },
        ],
      },
    ],
  };
};

export {
  createEmbedMessageGenerationEmbed,
  createInitialMessageGenerationEmbed,
  CreateMessageGenerationEmbedResult,
  generateMessageGenerationCustomId,
  MessageGenerationButtonTypes,
};
