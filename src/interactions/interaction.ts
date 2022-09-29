// Object for internal representation of interactions
// Adds responded and deferred fields to assist with error handling
interface InternalInteractionType<Interaction> {
  responded: boolean;
  deferred: boolean;
  interaction: Interaction;
}

const createInternalInteraction = <Interaction>(
  interaction: Interaction
): InternalInteractionType<Interaction> => {
  return {
    responded: false,
    deferred: false,
    interaction,
  };
};

export { createInternalInteraction, InternalInteractionType };
