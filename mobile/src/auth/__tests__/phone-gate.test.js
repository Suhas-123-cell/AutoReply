import { describe, it, expect } from "@jest/globals";
import { canUseWorkspace, hasVerifiedPhone } from "../phone-gate";
import { normalizePhoneNumber } from "../phone-number";

const verified = {
  user: { id: "user-1", phone: "+919876543210", phoneVerified: true },
  phoneVerificationRequired: false,
  workspace: { id: "workspace-1" },
  role: "OWNER",
};

describe("phone access gate", () => {
  it("allows a phone-verified workspace session", () => {
    expect(canUseWorkspace(verified)).toBe(true);
  });

  it.each([
    { ...verified, user: { id: "user-1" }, phoneVerificationRequired: undefined },
    { ...verified, user: { ...verified.user, phone: null } },
    { ...verified, user: { ...verified.user, phone: " " } },
    { ...verified, user: { ...verified.user, phoneVerified: false } },
    { ...verified, phoneVerificationRequired: true },
    { ...verified, phoneVerificationRequired: undefined },
  ])("rejects old or unverified profiles even if workspace grants are cached", (profile) => {
    expect(hasVerifiedPhone(profile)).toBe(false);
    expect(canUseWorkspace(profile)).toBe(false);
  });

  it("requires workspace grants in addition to phone verification", () => {
    expect(canUseWorkspace({ ...verified, workspace: null })).toBe(false);
    expect(canUseWorkspace({ ...verified, role: null })).toBe(false);
  });
});

describe("international phone input", () => {
  it("normalizes common formatting without guessing a country code", () => {
    expect(normalizePhoneNumber(" +91 (98765) 43210 ")).toBe("+919876543210");
    expect(normalizePhoneNumber("9876543210")).toBeNull();
  });

  it.each(["+0123456789", "+919876543210abc", "+123", "+1234567890123456"])("rejects invalid input %s", (phone) => {
    expect(normalizePhoneNumber(phone)).toBeNull();
  });
});
