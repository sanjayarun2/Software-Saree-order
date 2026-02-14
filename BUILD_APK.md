# How to Build APK for Saree Order Book

## Option A: Build via GitHub (No Java/Android needed)

Use GitHub Actions to build the APK in the cloud and download it.

1. **Initialize Git** (if not already):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Push to GitHub**:
   - Create a repo at [github.com/new](https://github.com/new)
   - Add remote and push:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git branch -M main
   git push -u origin main
   ```

3. **Build & download APK**:
   - Go to your repo → **Actions** tab
   - The workflow runs automatically on push
   - Or click **Build APK** → **Run workflow** to run manually
   - When finished, open the workflow run → **Artifacts** → download `saree-order-book-apk.zip` and extract `app-debug.apk`

---

## Option B: Build locally

### App Icon

The icon is in `public/icon.svg` (book + saree design). To use it as the Android app icon:

1. **Option A - Android Studio**: Open the project in Android Studio, right‑click `res` → New → Image Asset. Use `public/icon.svg` or a 1024×1024 PNG.
2. **Option B - Online**: Go to [appicon.co](https://www.appicon.co/) or [easyappicon.com](https://easyappicon.com), upload `public/icon.svg`, and download Android icons. Replace files in `android/app/src/main/res/mipmap-*/`.

## Prerequisites

- **Node.js** (v18+)
- **Java JDK 17** or higher
- **Android Studio** (or Android SDK with `ANDROID_HOME` set)
- **npm** (comes with Node.js)

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Build Web App

```bash
npm run build
```

This creates the static files in `out/`.

## Step 3: Add Android Platform (if not already added)

```bash
npx cap add android
```

## Step 4: Sync to Android

```bash
npx cap sync
```

## Step 5: Build APK

### Debug APK (for testing)

```bash
cd android
./gradlew assembleDebug
```

On Windows PowerShell:
```powershell
cd android
.\gradlew.bat assembleDebug
```

The APK will be at:
```
android\app\build\outputs\apk\debug\app-debug.apk
```

### Release APK (for distribution)

1. Create a keystore (one-time):
```bash
keytool -genkey -v -keystore saree-order-book.keystore -alias saree -keyalg RSA -keysize 2048 -validity 10000
```

2. Add to `android/app/build.gradle` (inside `android` block):
```gradle
signingConfigs {
    release {
        storeFile file('../../saree-order-book.keystore')
        storePassword 'your-password'
        keyAlias 'saree'
        keyPassword 'your-password'
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
        proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
    }
}
```

3. Build:
```bash
cd android
./gradlew assembleRelease
```

APK: `android\app\build\outputs\apk\release\app-release.apk`

## Step 6: Install on Device

- Copy `app-debug.apk` to your phone and open to install, or
- Use: `npx cap run android` (with device/emulator connected)

## Quick Commands

```bash
npm run build
npx cap sync
cd android && .\gradlew.bat assembleDebug
```

APK location: `android\app\build\outputs\apk\debug\app-debug.apk`
