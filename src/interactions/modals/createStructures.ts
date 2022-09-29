// Utility functions for creating modals
import {
  APIModalInteractionResponse,
  APITextInputComponent,
  ComponentType,
  InteractionResponseType,
  TextInputStyle,
} from "discord-api-types/v9";

// Create a modal with the correct types (for discord)
const createModal = ({
  title,
  custom_id,
  components,
}: {
  title: string;
  custom_id: string;
  components: APITextInputComponent[];
}): APIModalInteractionResponse => {
  return {
    type: InteractionResponseType.Modal,
    data: {
      title,
      custom_id,
      components: components.map((component) => ({
        type: ComponentType.ActionRow,
        components: [component],
      })),
    },
  };
};

interface CreateTextInputOptions {
  label: string;
  custom_id: string;
  short: boolean;
  placeholder?: string;
  value?: string;
  max_length?: number;
  min_length?: number;
  required?: boolean;
}

// For creating a text input object - discord type
const createTextInputWithRow = ({
  placeholder,
  value,
  max_length,
  min_length,
  label,
  required,
  custom_id,
  short,
}: CreateTextInputOptions): APITextInputComponent => {
  return {
    type: ComponentType.TextInput,
    placeholder,
    value,
    max_length,
    min_length,
    label,
    required,
    custom_id,
    style: short ? TextInputStyle.Short : TextInputStyle.Paragraph,
  };
};

export { createModal, createTextInputWithRow };
