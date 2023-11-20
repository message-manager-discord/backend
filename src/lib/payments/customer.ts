import { User } from "@prisma/client";
import { Snowflake } from "discord-api-types/globals";
import { FastifyInstance } from "fastify";
import Stripe from "stripe";

const createCustomer = async ({
  discordId,
  instance,
}: {
  discordId: Snowflake;
  instance: FastifyInstance;
}) => {
  const customer = await instance.stripeClient.customers.create({
    metadata: {
      discordId,
    },
  });
  return customer;
};

const findCustomer = async ({
  discordId,
  instance,
}: {
  discordId: Snowflake;
  instance: FastifyInstance;
}): Promise<Stripe.Customer | undefined> => {
  const customer = await instance.stripeClient.customers.search({
    limit: 1,
    query: `metadata["discordId"]:"${discordId}"`,
  });
  return customer.data[0];
};

const getCustomerID = async ({
  user,
  instance,
}: {
  user: User;
  instance: FastifyInstance;
}): Promise<string> => {
  // get stripe customer id for customer from database, if not, try and find, if not, create
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  let customerId: string | null = user.stripeCustomerId;
  if (customerId === null) {
    const customer = await findCustomer({
      discordId: user.id.toString(),
      instance,
    });
    if (customer !== undefined) {
      customerId = customer.id;
    } else {
      const newCustomer = await createCustomer({
        discordId: user.id.toString(),
        instance,
      });
      customerId = newCustomer.id;
    }
  }
  return customerId;
};

export { getCustomerID };
