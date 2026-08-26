import {
  type APIModalSubmissionComponent,
  ComponentType,
} from "discord-api-types/v9";

export const getModalValue = (
  components: APIModalSubmissionComponent[],
  customId: string,
): string | undefined => {
  for (const component of components) {
    if (component.type === ComponentType.ActionRow) {
      const input = component.components.find(
        (child) => child.custom_id === customId,
      );

      if (input !== undefined && "value" in input) {
        return typeof input.value === "string" ? input.value : undefined;
      }
    }

    if (component.type === ComponentType.Label) {
      const input = component.component;

      if (input.custom_id === customId && "value" in input) {
        return typeof input.value === "string" ? input.value : undefined; // TODO: This currently turns bools into undefined. When we migrate to components v2 this must change
      }
    }
  }

  return undefined;
};
