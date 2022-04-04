import {
  APIChatInputApplicationCommandInteraction,
  APIEmbed,
  APIInteractionResponse,
  APIInteractionResponseChannelMessageWithSource,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";
import { embedPink } from "../../../constants";
import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../../errors";
import { InternalInteraction } from "../../interaction";

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

const createDocsEmbed = (): APIEmbed => {
  return {
    title: "Docs",
    color: embedPink,
    timestamp: new Date().toISOString(),
    url: "https://message.anothercat.me/docs",
    description: "My docs are [here](https://message.anothercat.me/docs)",
  };
};

const createInviteEmbed = (): APIEmbed => {
  return {
    title: "Invite",
    color: embedPink,
    timestamp: new Date().toISOString(),
    url: "https://discord.com/api/oauth2/authorize?client_id=735395698278924359&permissions=515933326400&scope=bot%20applications.commands",
    description:
      "[Click here](https://discord.com/api/oauth2/authorize?client_id=735395698278924359&permissions=515933326400&scope=bot%20applications.commands) to invite me!",
  };
};

const createPrivacyEmbed = (): APIEmbed => {
  return {
    title: "Privacy Policy",
    color: embedPink,
    timestamp: new Date().toISOString(),
    description:
      "We do store data. Please read our [privacy policy](https://message.anothercat.me/privacy).",
    url: "https://message.anothercat.me/privacy",
  };
};

const createSourceEmbed = (): APIEmbed => {
  return {
    title: "Open Source",
    color: embedPink,
    timestamp: new Date().toISOString(),
    url: "https://github.com/message-manager-discord",
    description:
      "Message Manager is made up of a number of repos located in the [message-manager-discord](https://github.com/message-manager-discord) Github organization.",
  };
};

const createSupportEmbed = (): APIEmbed => {
  return {
    title: "Join my support server for support!",
    color: embedPink,
    timestamp: new Date().toISOString(),

    description: "Click [here](https://discord.gg/xFZu29t) to join!",
    url: "https://discord.gg/xFZu29t",
  };
};

const channelMessageResponseWithEmbed = (
  embed: APIEmbed
): APIInteractionResponseChannelMessageWithSource => ({
  type: InteractionResponseType.ChannelMessageWithSource,
  data: {
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  },
});

export default async function handleInfoCommand(
  internalInteraction: InternalInteraction<APIChatInputApplicationCommandInteraction>,
  instance: FastifyInstance
): Promise<APIInteractionResponse> {
  const interaction = internalInteraction.interaction;
  const subcommand = interaction.data.options?.[0]?.name;

  switch (subcommand) {
    case "info":
      return channelMessageResponseWithEmbed(await createInfoEmbed(instance));
    case "docs":
      return channelMessageResponseWithEmbed(createDocsEmbed());
    case "invite":
      return channelMessageResponseWithEmbed(createInviteEmbed());

    case "privacy":
      return channelMessageResponseWithEmbed(createPrivacyEmbed());

    case "source":
      return channelMessageResponseWithEmbed(createSourceEmbed());

    case "support":
      return channelMessageResponseWithEmbed(createSupportEmbed());

    default:
      throw new UnexpectedFailure(
        InteractionOrRequestFinalStatus.APPLICATION_COMMAND_UNEXPECTED_SUBCOMMAND,
        `Invalid subcommand: \`${subcommand || "no subcommand"}\``
      );
  }
}
