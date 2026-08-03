-- Mobile is moving off Expo managed workflow (bare RN + @react-native-firebase/messaging),
-- so PushDevice now stores real FCM registration tokens (Android natively, iOS via APNs
-- re-wrapped by Firebase) instead of Expo push tokens ("ExponentPushToken[...]").
ALTER TABLE "PushDevice" RENAME COLUMN "expoPushToken" TO "fcmToken";
ALTER INDEX "PushDevice_expoPushToken_key" RENAME TO "PushDevice_fcmToken_key";
