// Handle all message generation modal interactions
import {
  APIInteractionResponse,
  APIModalSubmitGuildInteraction,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import {
  ExpectedFailure,
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors";
import {
  getMessageFromCache,
  MessageSavedInCache,
  saveMessageToCache,
} from "../../lib/messages/cache";
import { isIsoDate } from "../../lib/messages/embeds/utils";
import { GuildSession } from "../../lib/session";
import { InternalInteractionType } from "../interaction";
import {
  createEmbedMessageGenerationEmbed,
  createInitialMessageGenerationEmbed,
  MessageGenerationButtonTypes,
} from "../shared/message-generation";
import { InteractionReturnData } from "../types";

export default async function handleModalMessageGeneration(
  internalInteraction: InternalInteractionType<APIModalSubmitGuildInteraction>,
  session: GuildSession,
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  const messageGenerationKey = interaction.data.custom_id.split(":")[1] as
    | string
    | undefined;
  const messageGenerationType = interaction.data.custom_id.split(":")[2] as
    | MessageGenerationButtonTypes
    | undefined; // Type used to determine which modal this is
  if (
    messageGenerationKey === undefined ||
    messageGenerationType === undefined
  ) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.COMPONENT_CUSTOM_ID_MALFORMED,
      "No message id on message generation button"
    );
  }
  const currentStatus = await getMessageFromCache({
    key: messageGenerationKey,
    instance,
  });
  // Call other functions depending on the type of modal
  switch (messageGenerationType) {
    case "content":
      return await handleContent({
        interaction,
        currentStatus,
        messageGenerationKey,
        instance,
      });

    case "embed-metadata":
      return await handleEmbedMetadata({
        interaction,
        currentStatus,
        messageGenerationKey,
        instance,
      });
    case "embed-footer":
      return await handleEmbedFooter({
        interaction,
        currentStatus,
        messageGenerationKey,
        instance,
      });

    case "embed-content":
      return await handleEmbedContent({
        interaction,
        currentStatus,
        messageGenerationKey,
        instance,
      });
    case "embed-add-field":
      return await handleEmbedAddField({
        interaction,
        currentStatus,
        messageGenerationKey,
        instance,
      });

    case "embed-author":
      return await handleEmbedAuthor({
        interaction,
        currentStatus,
        messageGenerationKey,
        instance,
      });

    case "edit-embed-field":
      return await handleEditEmbedField({
        interaction,
        currentStatus,
        messageGenerationKey,
        instance,
      });

    default:
      throw new UnexpectedFailure(
        InteractionOrRequestFinalStatus.MODAL_CUSTOM_ID_NOT_FOUND,
        "Invalid message generation type for modal"
      );
  }
}

// Handle editing content on message generation flow
const handleContent = async ({
  interaction,
  currentStatus,
  messageGenerationKey,
  instance,
}: {
  interaction: APIModalSubmitGuildInteraction;
  currentStatus: MessageSavedInCache;
  messageGenerationKey: string;
  instance: FastifyInstance;
}): Promise<APIInteractionResponse> => {
  const content = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "content"
  )?.components[0].value; // find content

  if (interaction.channel_id === undefined) {
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.GENERIC_UNEXPECTED_FAILURE,
      "Missing channel_id on modal submit"
    ); // Not sure why this might happen (discord typing says it could, but docs do not indicate why)
    // Hasn't thrown in tests yet
    // Will change if it happens
  }
  currentStatus.content = content; // Update content in cache
  await saveMessageToCache({
    key: messageGenerationKey,
    instance,
    data: currentStatus,
  });

  // Update representation by regenerating the embed
  const responseData = createInitialMessageGenerationEmbed(
    messageGenerationKey,
    currentStatus,
    interaction.guild_id
  );

  return {
    type: InteractionResponseType.UpdateMessage,
    data: {
      embeds: [responseData.embed],
      components: responseData.components,
      flags: MessageFlags.Ephemeral,
    },
  };
};

// Handle editing embed metadata on message generation flow
const handleEmbedMetadata = async ({
  interaction,
  currentStatus,
  messageGenerationKey,
  instance,
}: {
  interaction: APIModalSubmitGuildInteraction;
  currentStatus: MessageSavedInCache;
  messageGenerationKey: string;
  instance: FastifyInstance;
}): Promise<APIInteractionResponse> => {
  // Get the different fields
  const color = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "color"
  )?.components[0].value;
  const timestamp = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "timestamp"
  )?.components[0].value;
  const url = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "url"
  )?.components[0].value;
  const thumbnailUrl = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "thumbnail"
  )?.components[0].value;

  // If any are set, and embed is undefined define embed

  if (
    currentStatus.embed === undefined &&
    ((color !== undefined && color !== "") ||
      (timestamp !== undefined && timestamp !== "") ||
      (url !== undefined && url !== "") ||
      (thumbnailUrl !== undefined && thumbnailUrl !== ""))
  ) {
    currentStatus.embed = {};
  } else if (currentStatus.embed === undefined) {
    // None are set, and none have been set therefore we can safely return
    const returnData = createEmbedMessageGenerationEmbed(
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
  }
  // If color is set check if it a valid integer color then set color - if not set remove
  if (color !== undefined && color !== "") {
    if (isNaN(Number(color))) {
      throw new ExpectedFailure(
        InteractionOrRequestFinalStatus.EMBED_VALUE_EDITING_MALFORMED,
        "Color is not a valid integer"
      );
    }
    currentStatus.embed.color = Number(color);
  } else {
    currentStatus.embed.color = undefined;
  }
  // If timestamp is set check if it a valid ISO8601 timestamp then set timestamp - if not set remove
  if (timestamp !== undefined && timestamp !== "") {
    if (!isIsoDate(timestamp)) {
      throw new ExpectedFailure(
        InteractionOrRequestFinalStatus.EMBED_VALUE_EDITING_MALFORMED,
        "Timestamp is not a valid ISO8601 timestamp"
      );
    }
    currentStatus.embed.timestamp = timestamp;
  } else {
    currentStatus.embed.timestamp = undefined;
  }
  // If url is set check if it a valid URL then set url - if not set remove
  if (url !== undefined && url !== "") {
    if (!/^(http|https):\/\/[^ "]+$/.test(url)) {
      throw new ExpectedFailure(
        InteractionOrRequestFinalStatus.EMBED_VALUE_EDITING_MALFORMED,
        "URL is not a valid URL"
      );
    }
    currentStatus.embed.url = url;
  } else {
    currentStatus.embed.url = undefined;
  }
  // If thumbnailUrl is set check if it a valid URL then set - if not set remove
  if (thumbnailUrl !== undefined && thumbnailUrl !== "") {
    if (!/^(http|https):\/\/[^ "]+$/.test(thumbnailUrl)) {
      throw new ExpectedFailure(
        InteractionOrRequestFinalStatus.EMBED_VALUE_EDITING_MALFORMED,
        "Thumbnail URL is not a valid URL"
      );
    }
    currentStatus.embed.thumbnail = {
      url: thumbnailUrl,
    };
  } else {
    currentStatus.embed.thumbnail = undefined;
  }
  // Update the message in the cache
  await saveMessageToCache({
    key: messageGenerationKey,
    instance,
    data: currentStatus,
  });

  // Update representation by regenerating the embed
  const returnData = createEmbedMessageGenerationEmbed(
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
};

// Handle editing embed footer on message generation flow
const handleEmbedFooter = async ({
  interaction,
  currentStatus,
  messageGenerationKey,
  instance,
}: {
  interaction: APIModalSubmitGuildInteraction;
  currentStatus: MessageSavedInCache;
  messageGenerationKey: string;
  instance: FastifyInstance;
}): Promise<APIInteractionResponse> => {
  // Get the different fields
  const text = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "text"
  )?.components[0].value;
  const iconUrl = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "icon"
  )?.components[0].value;
  if (
    (text !== undefined && text !== "") ||
    (iconUrl !== undefined && iconUrl !== "") ||
    (currentStatus.embed?.footer?.text !== undefined &&
      currentStatus.embed?.footer?.text !== "") ||
    (currentStatus.embed?.footer?.icon_url !== undefined &&
      currentStatus.embed?.footer?.icon_url !== "")
    // Only "edit" the embed if new values will be set, or they already have been set (either setting or removing)
  ) {
    if (currentStatus.embed === undefined) {
      currentStatus.embed = {};
    }
    if (
      (text === undefined || text === "") &&
      iconUrl !== undefined &&
      iconUrl !== ""
    ) {
      // Text must be set for footer, this means text not set icon set
      throw new ExpectedFailure(
        InteractionOrRequestFinalStatus.EMBED_EDITING_MISSING_REQUIRED_VALUE,
        "Footer text must be set for any other footer value to be set. Either set a footer text, or remove the icon url."
      );
    }
    if (text === undefined || text === "") {
      // Icon url must also be undefined due to above check
      currentStatus.embed.footer = undefined;
    } else {
      if (currentStatus.embed.footer === undefined) {
        currentStatus.embed.footer = { text }; // If footer undefined set text and footer
      } else {
        currentStatus.embed.footer.text = text;
      }

      // Validate and set icon url - don't need to remove as would be removed by check before
      if (iconUrl !== undefined && iconUrl !== "") {
        // Validate iconurl is a valid url
        if (!/^(http|https):\/\/[^ "]+$/.test(iconUrl)) {
          throw new ExpectedFailure(
            InteractionOrRequestFinalStatus.EMBED_VALUE_EDITING_MALFORMED,
            "Icon URL is not a valid URL"
          );
        }
        currentStatus.embed.footer.icon_url = iconUrl;
      }
    }
    // Update the message in the cache
    await saveMessageToCache({
      key: messageGenerationKey,
      instance,
      data: currentStatus,
    });
  }
  // Update representation by regenerating the embed
  const returnData = createEmbedMessageGenerationEmbed(
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
};

// Handle editing embed content on message generation flow
const handleEmbedContent = async ({
  interaction,
  currentStatus,
  messageGenerationKey,
  instance,
}: {
  interaction: APIModalSubmitGuildInteraction;
  currentStatus: MessageSavedInCache;
  messageGenerationKey: string;
  instance: FastifyInstance;
}): Promise<APIInteractionResponse> => {
  // Get the different fields
  const title = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "title"
  )?.components[0].value;
  const description = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "description"
  )?.components[0].value;
  if (
    (title !== undefined && title !== "") ||
    (description !== undefined && description !== "") ||
    (currentStatus.embed?.title !== undefined &&
      currentStatus.embed?.title !== "") ||
    (currentStatus.embed?.description !== undefined &&
      currentStatus.embed?.description !== "")
  ) {
    // Only "edit" the embed if new values will be set, or they already have been set (either setting or removing)
    if (currentStatus.embed === undefined) {
      // ensure embed is defined
      currentStatus.embed = {};
    }
    if (title !== undefined && title !== "") {
      // If title is set set it - if not remove
      currentStatus.embed.title = title;
    } else {
      currentStatus.embed.title = undefined;
    }
    if (description !== undefined && description !== "") {
      // If description is set set it - if not remove
      currentStatus.embed.description = description;
    } else {
      currentStatus.embed.description = undefined;
    }
    // Update the message in the cache
    await saveMessageToCache({
      key: messageGenerationKey,
      instance,
      data: currentStatus,
    });
  }
  // Update representation by regenerating the embed
  const returnData = createEmbedMessageGenerationEmbed(
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
};

const parseTrueLikeValues = (value: string | undefined): boolean => {
  // As there is currently no input for booleans for modals
  // 'true' 't' 'y' 'yes' 'on' '1' - true
  // 'false' 'f' 'n' 'no' 'off' '0' and any other value - false
  // Case insensitive
  if (value === undefined) {
    return false;
  }
  const parsed = value.toLowerCase();
  return (
    parsed === "true" ||
    parsed === "t" ||
    parsed === "y" ||
    parsed === "yes" ||
    parsed === "on" ||
    parsed === "1"
  );
};

// Handle editing embed add field on message generation flow
const handleEmbedAddField = async ({
  interaction,
  currentStatus,
  messageGenerationKey,
  instance,
}: {
  interaction: APIModalSubmitGuildInteraction;
  currentStatus: MessageSavedInCache;
  messageGenerationKey: string;
  instance: FastifyInstance;
}): Promise<APIInteractionResponse> => {
  // Get the different fields
  const fieldName = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "name"
  )?.components[0].value;
  const fieldValue = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "value"
  )?.components[0].value;
  const inline = parseTrueLikeValues(
    interaction.data.components?.find(
      (component) => component.components[0].custom_id === "inline"
    )?.components[0].value
  );
  if (
    fieldName === undefined ||
    fieldName === "" ||
    fieldValue === undefined ||
    fieldValue === ""
  ) {
    // Name and value must be set, as this is adding a field
    throw new UnexpectedFailure(
      InteractionOrRequestFinalStatus.EMBED_EDITING_MISSING_DISCORD_REQUIRED_VALUE,
      "Field name and value must be set."
    );
  }

  if (currentStatus.embed === undefined) {
    // Ensure embed is defined
    currentStatus.embed = {};
  }
  if (currentStatus.embed.fields === undefined) {
    // Ensure fields is defined
    currentStatus.embed.fields = [];
  }

  currentStatus.embed.fields.push({
    name: fieldName,
    value: fieldValue,
    inline,
  });

  await saveMessageToCache({
    key: messageGenerationKey,
    instance,
    data: currentStatus,
  });

  // Update representation by regenerating the embed
  const returnData = createEmbedMessageGenerationEmbed(
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
};

// Handle editing embed edit field on message generation flow
// Different from above as field will already exist
const handleEditEmbedField = async ({
  interaction,
  currentStatus,
  messageGenerationKey,
  instance,
}: {
  interaction: APIModalSubmitGuildInteraction;
  currentStatus: MessageSavedInCache;
  messageGenerationKey: string;
  instance: FastifyInstance;
}): Promise<APIInteractionResponse> => {
  // Get the different fields
  const fieldName = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "name"
  )?.components[0].value;
  const fieldValue = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "value"
  )?.components[0].value;
  const inline = parseTrueLikeValues(
    interaction.data.components?.find(
      (component) => component.components[0].custom_id === "inline"
    )?.components[0].value
  );
  const fieldIndex = Number(interaction.data.custom_id.split(":")[3]); // Index in the current list - used identify which field

  if (
    (fieldName === undefined || fieldName === "") &&
    (fieldValue === undefined || fieldValue === "")
  ) {
    // Clear the field if name or value is not set
    if (currentStatus.embed?.fields?.[fieldIndex] !== undefined) {
      currentStatus.embed.fields.splice(fieldIndex, 1);
    }
  } else {
    // Otherwise, update the field
    // Both name and value must be set
    if (
      fieldName === undefined ||
      fieldName === "" ||
      fieldValue === undefined ||
      fieldValue === ""
    ) {
      throw new UnexpectedFailure(
        InteractionOrRequestFinalStatus.EMBED_EDITING_MISSING_DISCORD_REQUIRED_VALUE,
        "Field name and value both must be set. To remove the field make sure both are empty."
      );
    }
    // ensure embed and fields is defined
    if (currentStatus.embed === undefined) {
      currentStatus.embed = {};
    }
    if (currentStatus.embed.fields === undefined) {
      currentStatus.embed.fields = [];
    }
    // add field if field doesn't exist yet (shouldn't happen but just in case)
    if (currentStatus.embed.fields[fieldIndex] === undefined) {
      currentStatus.embed.fields.push({
        name: fieldName,
        value: fieldValue,
        inline,
      });
    } else {
      // otherwise update the field
      currentStatus.embed.fields[fieldIndex] = {
        name: fieldName,
        value: fieldValue,
        inline,
      };
    }
  }

  await saveMessageToCache({
    key: messageGenerationKey,
    instance,
    data: currentStatus,
  });
  // Update representation by regenerating the embed
  const returnData = createEmbedMessageGenerationEmbed(
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
};

// Handle editing embed edit author on message generation flow
const handleEmbedAuthor = async ({
  interaction,
  currentStatus,
  messageGenerationKey,
  instance,
}: {
  interaction: APIModalSubmitGuildInteraction;
  currentStatus: MessageSavedInCache;
  messageGenerationKey: string;
  instance: FastifyInstance;
}): Promise<APIInteractionResponse> => {
  // Handle author name, url, and icon url
  // Author name **must be set** if any values are set

  // Get the different fields
  const authorName = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "name"
  )?.components[0].value;
  const authorUrl = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "url"
  )?.components[0].value;
  const authorIconUrl = interaction.data.components?.find(
    (component) => component.components[0].custom_id === "icon"
  )?.components[0].value;
  if (
    (authorName !== undefined && authorName !== "") ||
    (authorUrl !== undefined && authorUrl !== "") ||
    (authorIconUrl !== undefined && authorIconUrl !== "") ||
    currentStatus.embed?.author?.name !== undefined // Only need to check name, as it must be set if any other is set
  ) {
    if (authorName === undefined || authorName === "") {
      if (
        (authorUrl !== undefined && authorUrl !== "") ||
        (authorIconUrl !== undefined && authorIconUrl !== "")
      ) {
        throw new ExpectedFailure(
          InteractionOrRequestFinalStatus.EMBED_EDITING_MISSING_REQUIRED_VALUE,
          "Author name must be set for any other author value to be set. Either set an author name, or remove the author url or author icon url."
        );
      } // clear author if name is not set
      if (currentStatus.embed !== undefined) {
        currentStatus.embed.author = undefined;
      }
    } else {
      // otherwise, update the author
      if (currentStatus.embed === undefined) {
        currentStatus.embed = {};
      }
      if (currentStatus.embed.author === undefined) {
        currentStatus.embed.author = { name: authorName };
      } else {
        currentStatus.embed.author.name = authorName;
      }

      if (authorUrl !== undefined && authorUrl !== "") {
        // Validate authorurl is a valid url - then set otherwise clear
        if (!/^(http|https):\/\/[^ "]+$/.test(authorUrl)) {
          throw new ExpectedFailure(
            InteractionOrRequestFinalStatus.EMBED_VALUE_EDITING_MALFORMED,
            "Author URL is not a valid URL"
          );
        }

        currentStatus.embed.author.url = authorUrl;
      } else {
        currentStatus.embed.author.url = undefined;
      }
      if (authorIconUrl !== undefined && authorIconUrl !== "") {
        // Validate authoriconurl is a valid url - then set otherwise clear
        if (!/^(http|https):\/\/[^ "]+$/.test(authorIconUrl)) {
          throw new ExpectedFailure(
            InteractionOrRequestFinalStatus.EMBED_VALUE_EDITING_MALFORMED,
            "Author Icon URL is not a valid URL"
          );
        }
        currentStatus.embed.author.icon_url = authorIconUrl;
      } else {
        currentStatus.embed.author.icon_url = undefined;
      }
    }
    await saveMessageToCache({
      key: messageGenerationKey,
      instance,
      data: currentStatus,
    });
  }
  // Update representation by regenerating the embed
  const returnData = createEmbedMessageGenerationEmbed(
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
};
