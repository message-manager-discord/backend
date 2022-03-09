import { Readable } from "stream";

interface FormDataReturnData {
  headers: Record<string, string>;
  body: Readable;
}
const isFormDataReturnData = (data: any): data is FormDataReturnData => {
  if (
    (data as FormDataReturnData).headers !== undefined &&
    (data as FormDataReturnData).body !== undefined
  ) {
    return true;
  }
  return false;
};

export { FormDataReturnData, isFormDataReturnData };
