# Android Setup & Optimization Guide

Run these commands first:
```bash
npm run build
npx cap add android
npx cap sync
```

Then apply the following optimizations:

## 1. ASO - App Store Optimization (AndroidManifest.xml)

Update `android/app/src/main/AndroidManifest.xml`:

Set `android:label` on `<application>`:
```xml
<application
    android:label="Saree Orderbook - Order Tracking"
    android:allowBackup="true"
    ...>
```

Keywords for ASO: Saree Order Tracking, Elampillai Handlooms, Order Management.

## 2. Splash Screen (White, Centered Logo)

Copy `android-overrides/res/values/colors.xml` to `android/app/src/main/res/values/`.

The capacitor.config.ts already sets `backgroundColor: "#FFFFFF"` and `launchAutoHide: false`. The splash hides when auth is ready (SplashController).

## 3. Session Clear on Device Restart

Create `android/app/src/main/java/com/sareeorder/app/BootReceiver.kt`:

```kotlin
package com.sareeorder.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val prefs: SharedPreferences = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            val editor = prefs.edit()
            for (key in prefs.all.keys) {
                if (key.startsWith("saree_sb_")) editor.remove(key)
            }
            editor.apply()
        }
    }
}
```

In AndroidManifest.xml, add inside `<application>`:
```xml
<receiver android:name=".BootReceiver"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED" />
    </intent-filter>
</receiver>
```

## 4. Compatibility (build.gradle)

Ensure `android/app/build.gradle` has:
- `minSdkVersion 22` (or higher)
- `compileSdkVersion 34`
- `targetSdkVersion 34`
- AndroidX dependencies

## 5. ASO Labels

In `android/app/build.gradle`, ensure `versionName` and `applicationId` are set. In `strings.xml`:
```xml
<string name="app_name">Saree Orderbook - Order Tracking</string>
<string name="title_activity_main">Saree Order Tracking | Elampillai Handlooms</string>
```

## 6. Run

```bash
npm run build
npx cap sync
npx cap open android
```
