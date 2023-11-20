import { User } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { ExpectedFailure } from "../../errors";
import { getCustomerID } from "./customer";
import httpErrors from "http-errors";
const { BadRequest } = httpErrors;

const createSubscription = async ({
  user,
  instance,
  priceId,
}: {
  user: User;
  instance: FastifyInstance;
  priceId: string;
}): Promise<{ subscriptionId: string; clientSecret: string }> => {
  const customerId = await getCustomerID({ user, instance });
  try {
    const subscription = await instance.stripeClient.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",

      payment_settings: {
        save_default_payment_method: "on_subscription",
      },
      expand: ["latest_invoice.payment_intent"],
    });
    // check that subscription.latest_invoice is Stripe.Invoice
    if (
      subscription.latest_invoice === null ||
      typeof subscription.latest_invoice === "string" ||
      subscription.latest_invoice.payment_intent === null ||
      typeof subscription.latest_invoice.payment_intent === "string" ||
      subscription.latest_invoice.payment_intent.client_secret === null
    ) {
      throw new Error("Incorrect return type from Stripe API");
    }
    return {
      subscriptionId: subscription.id,
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
    };
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    if ((error as any).code === "resource_missing") {
      throw BadRequest(`Price ID ${priceId} does not exist`);
    } else throw error;
  }
};

export { createSubscription };
