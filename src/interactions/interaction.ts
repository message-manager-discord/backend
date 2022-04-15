class InternalInteraction<Interaction> {
  responded: boolean;
  deferred: boolean;
  interaction: Interaction;
  constructor(interaction: Interaction) {
    this.responded = false;
    this.deferred = false;
    this.interaction = interaction;
  }
}

export { InternalInteraction };
