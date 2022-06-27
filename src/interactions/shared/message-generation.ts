import {
  APIActionRowComponent,
  APIEmbed,
  APIMessageActionRowComponent,
  APISelectMenuComponent,
  ButtonStyle,
  ComponentType,
} from "discord-api-types/v9";

import { embedPink } from "../../constants";
import { MessageSavedInCache } from "../../lib/messages/cache";
import { addTipToEmbed } from "../../lib/tips";

type MessageGenerationButtonTypes =
  | "content"
  | "embed"
  | "send"
  | "embed-metadata"
  | "select-fields"
  | "embed-footer"
  | "embed-content"
  | "embed-add-field"
  | "embed-author"
  | "embed-back"
  | "edit-embed-field";
const generateMessageGenerationCustomId = (
  messageGenerationKey: string,
  type: MessageGenerationButtonTypes,
  index?: number
): string => {
  return `message-generation:${messageGenerationKey}:${type}${
    index !== undefined ? `:${index}` : ""
  }`;
};

interface CreateMessageGenerationEmbedResult {
  embed: APIEmbed;
  components: APIActionRowComponent<APIMessageActionRowComponent>[];
}
const createInitialMessageGenerationEmbed = (
  messageGenerationKey: string,
  currentStatus: MessageSavedInCache
): CreateMessageGenerationEmbedResult => {
  return {
    embed: addTipToEmbed({
      title: "Message Generation Flow",
      description:
        "Use the buttons below to update the state of the message and embed. When you are done, click the send button." +
        "\n\n" +
        `**Current Content**: ${currentStatus.content ?? ""}` +
        "\n\n" +
        `${
          currentStatus.embed !== undefined
            ? "Embed exists, click the edit embed button to edit it."
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
            label: "Send",
            style: ButtonStyle.Success,
            custom_id: generateMessageGenerationCustomId(
              messageGenerationKey,
              "send"
            ),
          },
        ],
      },
    ],
  };
};

const createEmbedMessageGenerationEmbed = (
  messageGenerationKey: string,
  currentStatus: MessageSavedInCache
): CreateMessageGenerationEmbedResult => {
  let selectMenu: APIActionRowComponent<APISelectMenuComponent>;
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
            return {
              label: field.name,
              value: index.toString(),
            };
          }),
        },
      ],
    };
  } else {
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
        "Use the buttons below to update the state of the embed. When you are done, click the back button.",
      color: embedPink,
    }),
    components: [
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
