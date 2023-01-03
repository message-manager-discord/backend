import { Static, Type } from "@sinclair/typebox";
import { FastifyInstance } from "fastify";
import httpErrors from "http-errors";

import { getUserData } from "../../lib/user";
const { Unauthorized } = httpErrors;
const UserParams = Type.Object({
  id: Type.String({ description: "The user's id, `@me` for the current user" }),
});
type UserParamsType = Static<typeof UserParams>;
// eslint-disable-next-line @typescript-eslint/require-await
const internalPlugin = async (instance: FastifyInstance) => {
  instance.addHook("preHandler", async (request, response) => {
    if (
      request.headers.authorization !==
      `Bearer ${instance.envVars.INTERNAL_TOKEN}`
    ) {
      await response.send(new Unauthorized("Not authorized"));
    }
  });

  instance.get<{
    Params: UserParamsType;
  }>(
    "/internal/users/:id/data",
    {
      config: { ratelimit: { max: 3, timeWindow: 5 * 1000 } }, // Called often(ish), but shouldn't be called for the same user from that user often
      schema: {
        description: "Get a user's data (avatar & username & discrim)",
        tags: ["user"],
        security: [{ apiKey: [] }],
        params: UserParams,
        response: {
          200: {
            description: "OK",
            type: "object",
            properties: {
              // avatar can be string or null
              username: { type: "string" },
              discriminator: { type: "string" },
              avatar: { type: ["string", "null"] },
            },
          },
          401: {
            description: "Unauthorized",
            $ref: "responses.unauthorized#",
          },
        },
      },
    },
    async (request) => {
      if (request.params.id.length < 17) {
        // Internal profile - return that instead
        const profile = await instance.prisma.staffProfile.findUnique({
          where: {
            id: BigInt(request.params.id),
          },
        });
        if (profile === null) {
          return {
            avatar: instance.envVars.AVATAR_URL,
            username: instance.envVars.DEFAULT_STAFF_PROFILE_NAME,
            discriminator: "0000",
          };
        } else {
          return {
            username: profile.name,
            avatar: profile.avatar ?? instance.envVars.AVATAR_URL,
            discriminator: "0000",
          };
        }
      }
      return await getUserData(request.params.id, instance);
    }
  );
};

export default internalPlugin;
