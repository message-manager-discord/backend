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
