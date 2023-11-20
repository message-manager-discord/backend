import { FastifyInstance } from "fastify";

const getPaymentIntentStatus = async (
  paymentSecret: string,
  instance: FastifyInstance
) => {
  const paymentIntent = await instance.stripeClient.paymentIntents.retrieve(
    paymentSecret
  );
  if (paymentIntent === null || typeof paymentIntent === "string") {
    throw new Error("Incorrect return type from Stripe API");
  }

  return paymentIntent.status;
};

export { getPaymentIntentStatus };
