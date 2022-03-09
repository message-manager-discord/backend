import {
  APIInteractionResponse,
  APIMessageComponentGuildInteraction,
  APIUser,
  ButtonStyle,
  ComponentType,
} from "discord-api-types/v9";
import { FastifyInstance } from "fastify";

import crypto from "crypto";
import {
  ExpectedFailure,
  ExpectedOauth2Failure,
  InteractionOrRequestFinalStatus,
} from "../../errors";
import { InternalInteraction } from "../interaction";
import {
  createModal,
  createTextInputWithRow,
} from "../modals/createStructures";
import DiscordOauthRequests from "../../discordOauth";

export default async function handleReportButton(
  internalInteraction: InternalInteraction<APIMessageComponentGuildInteraction>,
  instance: FastifyInstance
): Promise<APIInteractionResponse> {
  const interaction = internalInteraction.interaction;
  const userId = interaction.member.user.id;
  const userTokens = await instance.prisma.user.findUnique({
    where: {
      id: BigInt(userId),
    },
  });

  let user: APIUser | undefined;
  try {
    user =
      userTokens && userTokens.oauthToken
        ? await instance.discordOauthRequests.fetchUser({
            userId,
            token: userTokens.oauthToken,
          })
        : undefined;
  } catch (e) {
    if (e instanceof ExpectedOauth2Failure) {
      if (e.status !== InteractionOrRequestFinalStatus.OATUH_TOKEN_EXPIRED) {
        // If it's token expired then it is "expected" for this function
        throw e;
      }
    } else {
      throw e;
    }
  }
  if (!user?.email) {
    const state = crypto.randomBytes(16).toString("hex");
    instance.redisCache.setState(
      state,
      "https://message.anothercat.me/docs/report"
    );
    throw new ExpectedFailure(
      InteractionOrRequestFinalStatus.USER_REQUIRED_TO_BE_SIGNED_IN,
      "You must have authorized the bot access to you account to report a message, so that we can email you about the result. Click the button below to sign in.",
      [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              label: "Sign in",
              style: ButtonStyle.Link,
              url: DiscordOauthRequests.generateAuthUrl(state),
            },
          ],
        },
      ]
    );
  }
  console.log(user.email);
  return createModal({
    title: `Submit a message report`,
    custom_id: interaction.data.custom_id,
    components: [
      createTextInputWithRow({
        label: "Reason for report",
        placeholder:
          "Describe why this message should be removed. See /faq reporting for more information.",
        custom_id: "reason",
        short: false,
        required: true,
        max_length: 4000,
        min_length: 10,
      }),
    ],
  });
}
