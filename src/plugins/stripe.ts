// Plugin that registers the stripe client to the fastify instance

import Stripe from "stripe";

import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

// Extend the fastify instance with the prisma client
declare module "fastify" {
  interface FastifyInstance {
    stripeClient: Stripe;
  }
}

// eslint-disable-next-line @typescript-eslint/require-await
const stripePlugin: FastifyPluginAsync = fp(async (server) => {
  if (process.env.STRIPE_SECRET_KEY === undefined) {
    throw new Error("Stripe secret key not set");
  }
  const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2022-11-15",
  });

  server.decorate("stripeClient", stripeClient);
});

export default stripePlugin;
