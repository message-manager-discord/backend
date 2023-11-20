/**
 * Routes to access various user data and edit some user data
 */

import { Static, Type } from "@sinclair/typebox";
import { FastifyInstance } from "fastify";

import { CreateSubscriptionResponseType } from "../types/payments";
import {
  InteractionOrRequestFinalStatus,
  UnexpectedFailure,
} from "../../errors";
import { createSubscription } from "../../lib/payments/subscriptions";
import { getPaymentIntentStatus } from "../../lib/payments/payment-intent";
import Stripe from "stripe";
const rootPath = "/payments";

const CreateSubscriptionBody = Type.Object({
  price_id: Type.String(),
});
type CreateSubscriptionBodyType = Static<typeof CreateSubscriptionBody>;

const GetPaymentIntentBody = Type.Object({
  intent_secret: Type.String(),
});
type GetPaymentIntentBodyType = Static<typeof GetPaymentIntentBody>;

// eslint-disable-next-line @typescript-eslint/require-await
const paymentsPlugin = async (instance: FastifyInstance) => {
  // Authorization is handled by the authentication plugin - this will throw FORBIDDEN if the user is not authorized
  instance.addHook(
    "preHandler",
    instance.auth([instance.requireAuthentication])
  );

  instance.post<{
    Body: CreateSubscriptionBodyType;
    Return: CreateSubscriptionResponseType;
  }>(
    `${rootPath}/create-subscription`,
    {
      config: { ratelimit: { max: 1, timeWindow: 10 * 1000 } },
      schema: {
        description: "Create a subscription",
        tags: ["user payments"],
        security: [{ apiKey: [] }],
        body: CreateSubscriptionBody,
        response: {
          200: {
            description: "OK",
            $ref: "models.createSubscriptionResponse#",
          },

          401: {
            description: "Unauthorized",
            $ref: "responses.unauthorized#",
          },
          404: {
            description: "Not Found - User needs to log in",
            $ref: "responses.notFound#",
          },
        },
      },
    },
    async (request) => {
      // Request.user must be present since the require authentication plugin is used
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion

      const priceId = request.body.price_id;

      const requestUser = request.user!;
      const user = await instance.prisma.user.findUnique({
        where: { id: BigInt(requestUser.userId) },
      });
      if (!user) {
        throw new UnexpectedFailure(
          InteractionOrRequestFinalStatus.GENERIC_UNEXPECTED_FAILURE,
          "User not found"
        );
      }
      return await createSubscription({
        user,
        instance,
        priceId,
      });
    }
  );

  instance.post<{
    Body: GetPaymentIntentBodyType;
  }>(
    `${rootPath}/payment-intent-status`,

    {
      config: { ratelimit: { max: 1, timeWindow: 10 * 1000 } },
      schema: {
        description: "Get a payment intent",
        tags: ["user payments"],
        security: [{ apiKey: [] }],
        body: GetPaymentIntentBody,
      },
    },
    async (request) => {
      // Request.user must be present since the require authentication plugin is used
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const requestUser = request.user!;
      const intentSecret = request.body.intent_secret;
      return await getPaymentIntentStatus(intentSecret, instance);
    }
  );
  instance.post(
    `${rootPath}/webhook`, // Enable rawBody plugin
    {
      config: {
        rawBody: true,
      },
    },
    async (request) => {
      let event: Stripe.Event;
      try {
        event = instance.stripeClient.webhooks.constructEvent(
          request.rawBody ?? "",
          request.headers["stripe-signature"] ?? "",
          process.env.STRIPE_WEBHOOK_SECRET ?? ""
        );
      } catch (error) {
        instance.log.error(error); // Not handled right TODO
        return { statusCode: 400 };
      }
      const handleInvoicePaid = async (event: Stripe.Event) => {
        // Use the Customer ID to link to a User in the database
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const user = await instance.prisma.user.findUnique({
          where: { stripeCustomerId: customerId },
          include: { premium_guilds: true },
        });
        if (!user) {
          instance.log.error(
            `Could not find user with stripe customer id ${customerId}`
          ); // TODO - Wrong error hanlding
          return;
        }
        console.log(invoice.period_end, "invoice.period_end");
        // Update the subscription status on each guild
        await instance.prisma.guild.updateMany({
          where: {
            premium_provider_user_id: user.id,
          },
          data: {
            // set to when the subscription ends + 3 days
            premium_expiry: new Date(
              invoice.period_end * 1000 + 3 * 24 * 60 * 60 * 1000
            ),
          },
        });
      };
      const handleSubscriptionEvents = async (event: Stripe.Event) => {
        // This might be incomplete, active, past_due, unpaid, or canceled
        // if it is active, then provision premium
        // otherwise leave 
        // as expired subscriptions will automatically expire 
        // when the premium_expiry date is reached
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const user = await instance.prisma.user.findUnique({
          where: { stripeCustomerId: customerId },
          include: { premium_guilds: true },
        });
        if (!user) {
          instance.log.error(
            `Could not find user with stripe customer id ${customerId}`
          ); // TODO - Wrong error hanlding
          return;
        }
        if (subscription.status === "active") {
          // Update the subscription status on each guild
          await instance.prisma.guild.updateMany({
            where: {
              premium_provider_user_id: user.id,
            },
            

      const dataObject = event.data.object;
      switch (event.type) {
        case "invoice.paid":
          // Used to provision services after the trial has ended.
          // The status of the invoice will show up as paid. Store the status in your
          // database to reference when a user accesses your service to avoid hitting rate limits.
          await handleInvoicePaid(event);
          break;
        case "invoice.payment_failed":
          // If the payment fails or the customer does not have a valid payment method,
          //  an invoice.payment_failed event is sent, the subscription becomes past_due.
          // Use this webhook to notify your user that their payment has
          // failed and to retrieve new card details.
          break;

        case "customer.subscription.created":
          // Handle new subscription
          (dataObject as Stripe.Subscription).current_period_end;
          break;
        case "customer.subscription.updated":
          // Handle updated subscription
          break;
        case "customer.subscription.deleted":
          if (event.request != null) {
            // handle a subscription canceled by your request
            // from above.
          } else {
            // handle subscription canceled automatically based
            // upon your subscription settings.
          }
          break;
        default:
        // Unexpected event type
      }
      return { statusCode: 200 };
    }
  );
};

export default paymentsPlugin;
