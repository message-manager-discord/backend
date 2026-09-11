// Types for internal interaction representations
import type {
  APIInteractionResponse,
  APIInteractionResponseDeferredChannelMessageWithSource,
  APIInteractionResponseDeferredMessageUpdate,
  RESTPatchAPIInteractionOriginalResponseJSONBody,
} from "discord-api-types/v9";
import type { Readable } from "stream";

// An interaction handler may return either a JSON interaction response or a FormData interaction response
// FormData responses should be used to send / response with a file or a message with a file
interface FormDataReturnData {
  headers: Record<string, string>;
  body: Readable;
}

// Response if the interaction has been deferred
type InteractionReturnDataAfterDeferred =
  RESTPatchAPIInteractionOriginalResponseJSONBody | FormDataReturnData;

// Any possible responses to an interaction
type InteractionReturnData =
  InteractionReturnDataDeferred | FormDataReturnData | APIInteractionResponse;

// This is for the response to defer an interaction - the callback is the thing to be called after the initial response has been sent

interface InteractionReturnDataDeferred {
  returnData:
    | APIInteractionResponseDeferredChannelMessageWithSource
    | APIInteractionResponseDeferredMessageUpdate;
  callback: () => Promise<InteractionReturnDataAfterDeferred>;
}

// Type guard to discern between a JSON response and a FormData response
const isFormDataReturnData = (
  data: InteractionReturnData | InteractionReturnDataAfterDeferred,
): data is FormDataReturnData => "headers" in data && "body" in data;

// Type guard to discern between a deferred response and a non-deferred response
const isInteractionReturnDataDeferred = (
  data: InteractionReturnData,
): data is InteractionReturnDataDeferred =>
  "callback" in data && "returnData" in data;

export type {
  FormDataReturnData,
  InteractionReturnData,
  InteractionReturnDataAfterDeferred,
};
export { isFormDataReturnData, isInteractionReturnDataDeferred };
