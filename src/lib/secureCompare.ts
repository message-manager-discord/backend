import { timingSafeEqual } from "crypto";

// Constant-time string comparison, used for comparing secrets so their contents
// are not leaked through response timing. Returns false when the lengths differ
// (timingSafeEqual throws on mismatched lengths).
const secureCompare = (a: string, b: string): boolean => {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  // Two empty buffers compare equal, so a blank secret being compared against a
  // blank caller-supplied token would otherwise authenticate the request.
  if (aBuffer.length === 0 || bBuffer.length === 0) {
    return false;
  }
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
};

export { secureCompare };
