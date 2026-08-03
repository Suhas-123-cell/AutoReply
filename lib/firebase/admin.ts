import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging as getAdminMessaging, type Messaging } from "firebase-admin/messaging";
import { getFirebaseServiceAccount } from "@/lib/env";

const globalForFirebase = globalThis as unknown as {
  firebaseApp?: App;
};

function getFirebaseApp(): App {
  if (!globalForFirebase.firebaseApp) {
    // Reuse an app initialized elsewhere in the process (e.g. hot reload in
    // dev) instead of throwing on "app already exists".
    globalForFirebase.firebaseApp =
      getApps()[0] ?? initializeApp({ credential: cert(getFirebaseServiceAccount()) });
  }
  return globalForFirebase.firebaseApp;
}

export function getMessaging(): Messaging {
  return getAdminMessaging(getFirebaseApp());
}
