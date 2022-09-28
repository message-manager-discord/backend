/* eslint-disable */
// Just a testing file
import { FastifyInstance } from "fastify";

const rootPlugin = async (instance: FastifyInstance) => {
  instance.get(
    "/",
    { preHandler: instance.auth([instance.requireAuthentication]) },
    async function (request, reply) {
      return { userId: request.user?.userId };
    }
  );
};

export default rootPlugin;
