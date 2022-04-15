import {
  APIApplicationCommandAutocompleteInteraction,
  APIApplicationCommandAutocompleteResponse,
  APIApplicationCommandInteractionDataStringOption,
  APIChatInputApplicationCommandInteraction,
  APIEmbed,
  APIInteractionResponseChannelMessageWithSource,
  ApplicationCommandOptionType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import { embedPink, inviteUrl } from "../../../constants";
import {
  ExpectedFailure,
  InteractionOrRequestFinalStatus,
} from "../../../errors";
import { InternalInteraction } from "../../interaction";
import Fuse from "fuse.js";
import { InteractionReturnData } from "../../types";
import { addTipToEmbed } from "../../../lib/tips";

const createInfoEmbed = async (
  instance: FastifyInstance
): Promise<APIEmbed> => {
  return {
    title: "Info about the bot",
    color: embedPink,
    timestamp: new Date().toISOString(),
    url: "https://message.anothercat.me",
    fields: [
      {
        name: "Website",
        value: "[My website](https://message.anothercat.me)",
        inline: true,
      },
      {
        name: "Github",
        value: "[Github account](https://github.com/message-manager-discord)",
        inline: true,
      },
      {
        name: "Docs",
        value: "[The Docs](https://message.anothercat.me/docs)",
        inline: true,
      },
      {
        name: "Support",
        value: "[Support Server](https://discord.gg/xFZu29t)",
        inline: true,
      },
      {
        name: "Developer",
        value: "[Another Cat](https://github.com/AnotherCat)",
        inline: true,
      },
      {
        name: "Status",
        value:
          "[Follow our status page for updates!](https://status--message.anothercat.me)",
        inline: true,
      },
      {
        name: "Node Version",
        value: process.version,
        inline: true,
      },
      { name: "Host System", value: process.platform, inline: true },
      {
        name: "Server Count",
        value: (await instance.redisGuildManager.getGuildCount()).toString(),
        inline: true,
      },
    ],
    thumbnail: {
      url: "https://cdn.discordapp.com/avatars/735395698278924359/a37614af9442e42bd8940a0a05c659e4.webp?size=1024",
    },
  };
};
interface Tag {
  url?: string;
  description: string;
  title: string;
  extraTags: string[];
}

interface TagWithName extends Tag {
  name: string;
}
// This allows us to use the same embeds for all the different commands, and to easily add more later.
const infoTags: Record<string, Tag> = {
  docs: {
    title: "Bot Documentation",
    description:
      "Documentation can be accessed either through a command (`/info`), which contains small bits of important information," +
      " or on the [website](https://message.anothercat.me/docs)",
    url: "https://message.anothercat.me/docs",
    extraTags: ["help"],
  },
  invite: {
    title: "Invite the bot",
    url: inviteUrl,
    description: `[Click here](${inviteUrl}) to invite the bot!`,
    extraTags: ["add"],
  },
  privacy: {
    title: "Privacy Policy",
    description:
      "We do store data. Please read our [privacy policy](https://message.anothercat.me/privacy).",
    url: "https://message.anothercat.me/privacy",
    extraTags: ["data"],
  },
  source: {
    title: "Open Source",
    url: "https://github.com/message-manager-discord",
    description:
      "Message Manager is made up of a number of repos located in the [message-manager-discord](https://github.com/message-manager-discord) Github organization.",
    extraTags: ["code"],
  },
  support: {
    title: "Join my support server for support!",

    description: "Click [here](https://discord.gg/xFZu29t) to join!",
    url: "https://discord.gg/xFZu29t",
    extraTags: ["server", "help"],
  },
  terms: {
    title: "Terms of Service",
    description:
      "By using the bot and related services, you agree to the [terms of service](https://message.anothercat.me/terms). Please read them carefully.",
    url: "https://message.anothercat.me/terms",
    extraTags: ["tos"],
  },
  "message-migration": {
    title: "Migrating old messages over",
    description:
      "As part of the migration to the new system, messages are now stored by the bot to facilitate extra features." +
      " This means that messages that were previously sent by the bot are not currently recognized by the actions commands." +
      "\nTo migrate messages over, a context menu command will be added to the guild after an action command fails on the guild." +
      "\nOnly message created before the migration date can be migrated, this is because messages sent after the date are already in the database and do not need to be migrated. " +
      "This prevents non-user created messages being editable.",

    extraTags: ["new", "missing"],
  },
};

interface NonTextTag {
  createEmbed: (instance: FastifyInstance) => Promise<APIEmbed>;
  extraTags: string[];
}
interface NonTextTagWithName extends NonTextTag {
  name: string;
}
const nonTextTags: Record<string, NonTextTag> = {
  info: {
    createEmbed: createInfoEmbed,
    extraTags: ["stats", "servers"],
  },
};

const textTags = Object.keys(infoTags);

const nonTextTagsNames = Object.keys(nonTextTags);

const allTags: (TagWithName | NonTextTagWithName)[] = [];
for (const tagName in infoTags) {
  if (Object.prototype.hasOwnProperty.call(infoTags, tagName)) {
    const tag = infoTags[tagName];
    allTags.push({
      name: tagName,
      ...tag,
    });
  }
}
for (const tagName in nonTextTags) {
  if (Object.prototype.hasOwnProperty.call(nonTextTags, tagName)) {
    const tag = nonTextTags[tagName];
    allTags.push({
      name: tagName,
      ...tag,
    });
  }
}

const createEmbedFromTag = (tag: Tag): APIEmbed => {
  return {
    title: tag.title,
    url: tag.url,
    description: tag.description,
    color: embedPink,
    timestamp: new Date().toISOString(),
  };
};

const channelMessageResponseWithEmbed = (
  embed: APIEmbed
): APIInteractionResponseChannelMessageWithSource => ({
  type: InteractionResponseType.ChannelMessageWithSource,
  data: {
    embeds: [addTipToEmbed(embed)],
    flags: MessageFlags.Ephemeral,
  },
});

export default async function handleInfoCommand(
  internalInteraction: InternalInteraction<APIChatInputApplicationCommandInteraction>,
  instance: FastifyInstance
): Promise<InteractionReturnData> {
  const interaction = internalInteraction.interaction;
  const tagName: string | undefined = (
    interaction.data.options?.find(
      (option) =>
        option.name === "tag" &&
        option.type === ApplicationCommandOptionType.String
    ) as APIApplicationCommandInteractionDataStringOption
  )?.value;
  if (nonTextTagsNames.indexOf(tagName) >= 0) {
    return channelMessageResponseWithEmbed(
      await nonTextTags[tagName].createEmbed(instance)
    );
  } else if (textTags.indexOf(tagName) >= 0) {
    return channelMessageResponseWithEmbed(
      createEmbedFromTag(infoTags[tagName])
    );
  } else {
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.TAG_NOT_FOUND,
      "That tag was not found"
    );
  }
}

// eslint-disable-next-line @typescript-eslint/require-await
async function handleInfoAutocomplete(
  internalInteraction: InternalInteraction<APIApplicationCommandAutocompleteInteraction>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  instance: FastifyInstance
): Promise<APIApplicationCommandAutocompleteResponse> {
  const interaction = internalInteraction.interaction;
  const tagFilling: string | undefined = (
    interaction.data.options?.find(
      (option) =>
        option.name === "tag" &&
        option.type === ApplicationCommandOptionType.String
    ) as APIApplicationCommandInteractionDataStringOption
  )?.value;
  // If the tag option is being filled out return a list of tags, filtered by the tagsSearch
  // Otherwise return a list of tags ordered alphabetically
  // Max 25 tags returned
  if (tagFilling) {
    const tagsSearch = new Fuse(allTags, {
      isCaseSensitive: false,
      includeScore: true,
      shouldSort: true,
      findAllMatches: true,
      keys: [
        { name: "name", weight: 0.7 },
        { name: "extraTags", weight: 0.3 }, // Name matches should show up higher
      ],
    });
    const tags = tagsSearch.search(tagFilling, { limit: 25 });

    return {
      type: InteractionResponseType.ApplicationCommandAutocompleteResult,
      data: {
        choices: tags.map((tag) => ({
          value: tag.item.name,
          name: tag.item.name,
        })),
      },
    };
  } else {
    const tags = allTags.sort((a, b) => a.name.localeCompare(b.name));
    return {
      type: InteractionResponseType.ApplicationCommandAutocompleteResult,
      data: {
        choices: tags
          .slice(0, 25)
          .map((tag) => ({ value: tag.name, name: tag.name })),
      },
    };
  }
}

export { handleInfoAutocomplete };
