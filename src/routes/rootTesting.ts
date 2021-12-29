import { FastifyInstance } from "fastify";

const rootPlugin = async (instance: FastifyInstance) => {
  instance.get(
    "/",
    { preHandler: instance.auth([instance.requireAuthentication]) },
    async function (request, reply) {
      return { userId: request.userId };
    }
  );
};

export default rootPlugin;
