import { Capacitor } from "@capacitor/core";

/**
 * FCM push is only safe when the APK was built with android/app/google-services.json
 * and NEXT_PUBLIC_ENABLE_FCM_PUSH=true. Without both, PushNotifications.register()
 * can crash the Android app right after login.
 */
export function isFcmPushEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_FCM_PUSH === "true";
}

export function shouldInitNativePush(): boolean {
  return Capacitor.isNativePlatform() && isFcmPushEnabled();
}
