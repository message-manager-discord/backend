import {
  APIEmbed,
  APIInteractionResponse,
  APIMessageComponentGuildInteraction,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import { embedPink } from "../../constants";
import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors";
import {
  getMessageFromCache,
  MessageSavedInCache,
  splitMessageCacheKey,
} from "../../lib/messages/cache";
import { sendMessage } from "../../lib/messages/send";
import { GuildSession } from "../../lib/session";
import { addTipToEmbed } from "../../lib/tips";
import { InternalInteractionType } from "../interaction";
import {
  createModal,
  createTextInputWithRow,
} from "../modals/createStructures";
import handleMessageGenerationSelect from "../selects/message-generation";
import {
  createEmbedMessageGenerationEmbed,
  createInitialMessageGenerationEmbed,
  CreateMessageGenerationEmbedResult,
  MessageGenerationButtonTypes,
} from "../shared/message-generation";
import { InteractionReturnData } from "../types";

export default async function handleMessageGenerationButton(
  internalInteraction: InternalInteractionType<APIMessageComponentGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  const messageGenerationKey = interaction.data.custom_id.split(":")[1] as
    | string
    | undefined;
  const messageGenerationType = interaction.data.custom_id.split(":")[2] as
    | MessageGenerationButtonTypes
    | undefined;
  if (
    messageGenerationKey === undefined ||
    messageGenerationType === undefined
  ) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.COMPONENT_CUSTOM_ID_MALFORMED,
      "No message key on message generation button"
    );
  }
  const currentStatus = await getMessageFromCache({
    key: messageGenerationKey,
    instance,
  });
  const channelId = splitMessageCacheKey(messageGenerationKey).channelId;
  let returnData: CreateMessageGenerationEmbedResult;
  switch (messageGenerationType) {
    case "content":
      return createModal({
        title: "Edit Content",
        custom_id: interaction.data.custom_id, // This is the same
        components: [
          createTextInputWithRow({
            label: "Message Content",
            value: currentStatus.content,
            max_length: 2000,
            required: false,
            custom_id: "content",
            short: false,
          }),
        ],
      });

    case "embed":
      returnData = createEmbedMessageGenerationEmbed(
        messageGenerationKey,
        currentStatus
      );
      return {
        type: InteractionResponseType.UpdateMessage,
        data: {
          embeds: [returnData.embed],
          components: returnData.components,
          flags: MessageFlags.Ephemeral,
        },
      };
    case "embed-metadata":
      return createModal({
        title: "Edit Embed Metadata",
        custom_id: interaction.data.custom_id, // This is the same
        components: [
          createTextInputWithRow({
            label: "Embed Color",
            value: currentStatus.embed?.color?.toString(),

            required: false,
            custom_id: "color",
            placeholder:
              "integer color value - use a converter to use hex or rgb",
            short: true,
          }),
          createTextInputWithRow({
            label: "Embed Timestamp",
            value: currentStatus.embed?.timestamp,

            required: false,
            custom_id: "timestamp",
            placeholder: "ISO8601 timestamp",
            short: true,
          }),
          createTextInputWithRow({
            label: "Embed URL",
            value: currentStatus.embed?.url,
            max_length: 2000,
            required: false,
            custom_id: "url",
            placeholder: "A URL",
            short: true,
          }),
          createTextInputWithRow({
            label: "Embed Thumbnail URL",
            value: currentStatus.embed?.thumbnail?.url,
            max_length: 2000,
            required: false,
            custom_id: "thumbnail",
            placeholder: "URL of thumbnail",
            short: true,
          }),
        ],
      });
    case "embed-footer":
      return createModal({
        title: "Edit Embed Footer",
        custom_id: interaction.data.custom_id, // This is the same
        components: [
          createTextInputWithRow({
            label: "Embed Footer Text",
            value: currentStatus.embed?.footer?.text,
            max_length: 2048,
            required: false,
            custom_id: "text",
            placeholder: "Footer text",
            short: false,
          }),
          createTextInputWithRow({
            label: "Embed Footer Icon URL",
            value: currentStatus.embed?.footer?.icon_url,
            max_length: 2000,
            required: false,
            custom_id: "icon",
            placeholder: "URL of footer icon",
            short: true,
          }),
        ],
      });
    case "embed-content":
      return createModal({
        title: "Edit Embed Content",
        custom_id: interaction.data.custom_id, // This is the same
        components: [
          createTextInputWithRow({
            label: "Embed Title",
            value: currentStatus.embed?.title,
            max_length: 256,
            required: false,
            custom_id: "title",
            placeholder: "Title",
            short: true,
          }),
          createTextInputWithRow({
            label: "Embed Description",
            value: currentStatus.embed?.description,
            max_length: 4000,
            required: false,
            custom_id: "description",
            placeholder: "Description",
            short: false,
          }),
        ],
      });
    case "embed-add-field":
      return createModal({
        title: "Add Embed Field",
        custom_id: interaction.data.custom_id, // This is the same
        components: [
          createTextInputWithRow({
            label: "Embed Field Name",

            max_length: 256,
            required: true,
            custom_id: "name",
            placeholder: "Field name",
            short: true,
          }),
          createTextInputWithRow({
            label: "Embed Field Value",
            max_length: 1024,
            required: true,
            custom_id: "value",
            placeholder: "Field value",
            short: false,
          }),
          createTextInputWithRow({
            label: "Embed Field Inline",
            max_length: 15,
            required: false,
            custom_id: "inline",
            placeholder: "Field inline - default 'false'",
            short: true,
          }),
        ],
      });
    case "embed-author":
      return createModal({
        title: "Edit Embed Author",
        custom_id: interaction.data.custom_id, // This is the same
        components: [
          createTextInputWithRow({
            label: "Embed Author Name",
            value: currentStatus.embed?.author?.name,
            max_length: 256,
            required: false,
            custom_id: "name",
            placeholder: "Author name",
            short: true,
          }),
          createTextInputWithRow({
            label: "Embed Author URL",
            value: currentStatus.embed?.author?.url,
            max_length: 2000,
            required: false,
            custom_id: "url",
            placeholder: "Author URL",
            short: true,
          }),
          createTextInputWithRow({
            label: "Embed Author Icon URL",
            value: currentStatus.embed?.author?.icon_url,
            max_length: 2000,
            required: false,
            custom_id: "icon",
            placeholder: "Author icon URL",
            short: true,
          }),
        ],
      });

    case "embed-back":
      returnData = createInitialMessageGenerationEmbed(
        messageGenerationKey,
        currentStatus
      );
      return {
        type: InteractionResponseType.UpdateMessage,
        data: {
          embeds: [returnData.embed],
          components: returnData.components,
          flags: MessageFlags.Ephemeral,
        },
      };

    case "send":
      return await handleSend({
        channelId,
        currentStatus,
        instance,
        session,
        interaction,
        messageGenerationKey,
      });

    case "select-fields":
      return await handleMessageGenerationSelect(
        internalInteraction,
        session,
        instance
      );

    default:
      throw new UnexpectedFailure(
        InteractionOrRequestFinalStatus.COMPONENT_CUSTOM_ID_NOT_FOUND,
        "Invalid message generation type"
      );
  }
}

const handleSend = async ({
  channelId,
  currentStatus,
  instance,
  session,
  interaction,
  messageGenerationKey,
}: {
  channelId: string;
  currentStatus: MessageSavedInCache;
  instance: FastifyInstance;
  session: GuildSession;
  messageGenerationKey: string;
  interaction: APIMessageComponentGuildInteraction;
}): Promise<APIInteractionResponse> => {
  const message = await sendMessage({
    channelId,
    content: currentStatus.content,
    embed: currentStatus.embed,
    instance,
    session,
  });

  await instance.redisCache.deleteMessageCache(messageGenerationKey);

  const messageLink = `https://discord.com/channels/${interaction.guild_id}/${channelId}/${message.id}`;

  const embed: APIEmbed = {
    color: embedPink,
    title: "Message Sent",
    description: `Message sent! [Jump to message](${messageLink})`,
    url: messageLink,
    timestamp: new Date().toISOString(),
  };

  return {
    type: InteractionResponseType.UpdateMessage,
    data: {
      embeds: [addTipToEmbed(embed)],
      components: [],
      flags: MessageFlags.Ephemeral,
    },
  };
};
