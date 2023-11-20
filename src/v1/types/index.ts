import { reportSchemas } from "./reports";
import { paymentSchemas } from "./payments";

export const schemas = [...reportSchemas, ...paymentSchemas];
