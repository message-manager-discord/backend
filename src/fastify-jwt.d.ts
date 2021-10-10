import "fastify-jwt";
import { Snowflake } from "discord-api-types/v9";

declare module "fastify-jwt" {
  interface FastifyJWT {
    payload: { userId: Snowflake; staff?: boolean };
  }
}
