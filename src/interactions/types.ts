import {
  APIInteractionResponse,
  APIInteractionResponseDeferredChannelMessageWithSource,
  APIInteractionResponseDeferredMessageUpdate,
  RESTPatchAPIInteractionOriginalResponseJSONBody,
} from "discord-api-types/v9";
import { Readable } from "stream";

interface FormDataReturnData {
  headers: Record<string, string>;
  body: Readable;
}

type InteractionReturnDataAfterDeferred =
  | RESTPatchAPIInteractionOriginalResponseJSONBody
  | FormDataReturnData;

type InteractionReturnData =
  | InteractionReturnDataDeferred
  | FormDataReturnData
  | APIInteractionResponse;

interface InteractionReturnDataDeferred {
  returnData:
    | APIInteractionResponseDeferredChannelMessageWithSource
    | APIInteractionResponseDeferredMessageUpdate;
  callback: () => Promise<InteractionReturnDataAfterDeferred>;
}

const isFormDataReturnData = (
  data: InteractionReturnData | InteractionReturnDataAfterDeferred
): data is FormDataReturnData =>
  (data as FormDataReturnData).headers !== undefined &&
  (data as FormDataReturnData).body !== undefined;

const isInteractionReturnDataDeferred = (
  data: InteractionReturnData
): data is InteractionReturnDataDeferred =>
  (data as InteractionReturnDataDeferred).callback !== undefined &&
  (data as InteractionReturnDataDeferred).returnData !== undefined;

export {
  FormDataReturnData,
  isFormDataReturnData,
  isInteractionReturnDataDeferred,
  InteractionReturnData,
  InteractionReturnDataAfterDeferred,
};
