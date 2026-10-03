import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react-native";
import { getAuth, getIdToken, onAuthStateChanged, signInWithPhoneNumber, signOut } from "@react-native-firebase/auth";
import { apiFetch } from "../../api/client";
import { useAuth } from "../AuthContext";
import VerifyPhoneScreen from "../../../app/(auth)/verify-phone";

jest.mock("@react-native-firebase/auth", () => ({
  getAuth: jest.fn(), getIdToken: jest.fn(), onAuthStateChanged: jest.fn(),
  signInWithPhoneNumber: jest.fn(), signOut: jest.fn(),
}));
jest.mock("../../api/client", () => ({ apiFetch: jest.fn(), ApiError: class extends Error {} }));
jest.mock("../AuthContext", () => ({ useAuth: jest.fn() }));

const phone = "+919876543210";
let listener;
let confirmation;
let refreshSession;
let appSignOut;

beforeEach(() => {
  jest.clearAllMocks();
  listener = null;
  confirmation = { confirm: jest.fn() };
  refreshSession = jest.fn().mockResolvedValue(undefined);
  appSignOut = jest.fn().mockResolvedValue(undefined);
  useAuth.mockReturnValue({ user: { email: "owner@example.com" }, refreshSession, signOut: appSignOut });
  getAuth.mockReturnValue({});
  signOut.mockResolvedValue(undefined);
  getIdToken.mockResolvedValue("fresh-firebase-id-token");
  apiFetch.mockResolvedValue({ phone, phoneVerified: true });
  onAuthStateChanged.mockImplementation((auth, callback) => { listener = callback; callback(null); return jest.fn(); });
  signInWithPhoneNumber.mockResolvedValue(confirmation);
});
afterEach(cleanup);

async function requestSms() {
  const screen = render(<VerifyPhoneScreen />);
  fireEvent.changeText(screen.getByLabelText("Phone number with country code"), phone);
  fireEvent.press(screen.getByText("Send SMS code"));
  await waitFor(() => expect(screen.getByLabelText("Verification code")).toBeTruthy());
  return screen;
}

describe("Firebase phone enrollment", () => {
  it("ignores a stale Firebase user and accepts fresh Android auto verification", async () => {
    await requestSms();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signInWithPhoneNumber).toHaveBeenCalledWith(expect.anything(), phone, false);
    const stale = { phoneNumber: phone, metadata: { lastSignInTime: "2020-01-01T00:00:00Z" } };
    await act(async () => listener(stale));
    expect(apiFetch).not.toHaveBeenCalled();
    const fresh = { phoneNumber: phone, metadata: { lastSignInTime: new Date().toISOString() } };
    await act(async () => listener(fresh));
    await waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(1));
    expect(getIdToken).toHaveBeenCalledWith(fresh, true);
    expect(apiFetch).toHaveBeenCalledWith("/api/mobile/auth/verify-phone", {
      method: "POST", body: { idToken: "fresh-firebase-id-token" },
    });
    expect(signOut).toHaveBeenCalledTimes(2);
  });

  it("handles instant verification before the SMS confirmation promise returns", async () => {
    const fresh = { phoneNumber: phone, metadata: { lastSignInTime: new Date().toISOString() } };
    signInWithPhoneNumber.mockImplementation(async () => {
      listener(fresh);
      return confirmation;
    });
    const screen = render(<VerifyPhoneScreen />);
    fireEvent.changeText(screen.getByLabelText("Phone number with country code"), phone);
    fireEvent.press(screen.getByText("Send SMS code"));
    await waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(1));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(confirmation.confirm).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(2);
  });

  it("does not send another SMS during the resend cooldown", async () => {
    const screen = await requestSms();
    fireEvent.press(screen.getByText("Resend in 60s"));
    expect(signInWithPhoneNumber).toHaveBeenCalledTimes(1);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("submits once when manual confirmation and the auth listener finish together", async () => {
    const screen = await requestSms();
    const fresh = { phoneNumber: phone, metadata: { lastSignInTime: new Date().toISOString() } };
    confirmation.confirm.mockImplementation(async () => {
      listener(fresh);
      return { user: fresh };
    });
    fireEvent.changeText(screen.getByLabelText("Verification code"), "123456");
    fireEvent.press(screen.getByText("Verify phone"));
    await waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(1));
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the app gated when the backend rejects the verified number", async () => {
    const screen = await requestSms();
    apiFetch.mockRejectedValue(new Error("Rejected"));
    const fresh = { phoneNumber: phone, metadata: { lastSignInTime: new Date().toISOString() } };
    await act(async () => listener(fresh));
    await waitFor(() => expect(screen.getByText("Couldn't verify your phone. Please try again.")).toBeTruthy());
    expect(refreshSession).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Sign out")).toBeTruthy();
    expect(screen.getByText("Delete account")).toBeTruthy();
  });
});
