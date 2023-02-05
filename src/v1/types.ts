// Often repeated schema for all routes

const errors401to404ResponseSchema = {
  401: {
    description: "Unauthorized",
    $ref: "responses.unauthorized#",
  },
  403: {
    description: "Forbidden - Missing privileges",
    $ref: "responses.forbidden#",
  },
  404: {
    description: "Not Found - User needs to log in",
    $ref: "responses.notFound#",
  },
};

export { errors401to404ResponseSchema };
