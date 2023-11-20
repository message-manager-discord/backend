import { Static, Type } from "@sinclair/typebox";

const CreateSubscriptionResponse = Type.Object(
  {
    subscriptionId: Type.String(),
    clientSecret: Type.String(),
  },
  { $id: "models.createSubscriptionResponse" }
);

type CreateSubscriptionResponseType = Static<typeof CreateSubscriptionResponse>;

export const paymentSchemas = [CreateSubscriptionResponse];
export type { CreateSubscriptionResponseType };
