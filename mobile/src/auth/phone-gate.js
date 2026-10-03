// Old cached profiles must pass the same explicit phone check as fresh sessions.
export function hasVerifiedPhone(profile) {
  return Boolean(
    typeof profile?.user?.phone === "string" &&
    profile.user.phone.trim() &&
    profile.user.phoneVerified === true &&
    profile.phoneVerificationRequired === false
  );
}

export function canUseWorkspace(profile) {
  return hasVerifiedPhone(profile) && Boolean(profile?.workspace?.id && profile?.role);
}
