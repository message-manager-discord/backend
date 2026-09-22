import { describe, expect, it } from "vitest";

import { secureCompare } from "../../lib/secureCompare.js";

describe("secureCompare", () => {
  it("accepts an exact match", () => {
    expect(secureCompare("secret", "secret")).toBe(true);
  });

  it("rejects a same-length value that differs", () => {
    expect(secureCompare("secret", "secreT")).toBe(false);
  });

  it("rejects a value of a different length", () => {
    expect(secureCompare("secret", "secret-longer")).toBe(false);
  });

  // The three cases below are the security property the helper exists for: a
  // blank secret being compared against a blank caller-supplied token must not
  // authenticate, even though two empty buffers compare equal.
  it("fails closed when the caller supplied nothing", () => {
    expect(secureCompare("", "secret")).toBe(false);
  });

  it("fails closed when the configured secret is blank", () => {
    expect(secureCompare("secret", "")).toBe(false);
  });

  it("fails closed when both sides are blank", () => {
    expect(secureCompare("", "")).toBe(false);
  });

  it("verifies the header shape used by the internal route", () => {
    expect(secureCompare("Bearer abc", "Bearer abc")).toBe(true);
  });
});
