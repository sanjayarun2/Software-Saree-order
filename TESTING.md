# Testing & Debugging Guide

## Automated APK Build & Install

### Quick Start
Run the automated script:
```powershell
npm run apk:auto
```

Or directly:
```powershell
powershell -ExecutionPolicy Bypass -File ./build-and-install.ps1
```

### What It Does
1. ✅ Checks if ADB is installed
2. ✅ Verifies a device is connected via USB
3. ✅ Checks Java installation
4. ✅ Installs npm dependencies
5. ✅ Builds the APK
6. ✅ Installs APK on connected device

### Requirements
- Android device connected via USB
- USB Debugging enabled
- ADB in PATH (Android SDK Platform Tools)
- Java 17 JDK installed (JAVA_HOME set)

---

## PDF Download Testing

### Test Page
Visit: `/test-pdf` in your app

This page provides:
- **Single Order PDF Test**: Tests downloading one order
- **Multiple Orders PDF Test**: Tests downloading multiple orders
- **Blob Creation Test**: Verifies browser Blob support
- **Real-time Logs**: See what's happening step-by-step

### Browser Console Debugging

All PDF operations log detailed information to the browser console:

1. **Open DevTools** (F12)
2. **Go to Console tab**
3. **Click PDF download button**
4. **Watch for logs** prefixed with `[PDF]`:

```
[PDF] downloadOrdersPdf called for 5 orders
[PDF] Creating jsPDF document...
[PDF] Drawing 5 orders...
[PDF] Generating blob for filename: saree-orders-2026-02-14.pdf
[PDF] Blob generated, size: 45678 bytes, pages: 2
[PDF] savePdfBlob called: saree-orders-2026-02-14.pdf, blob size: 45678 bytes
[PDF] Starting download: saree-orders-2026-02-14.pdf, size: 45678 bytes
[PDF] Blob URL created: blob:http://localhost:3000/abc123...
[PDF] Anchor element created and appended, triggering click...
[PDF] Download triggered successfully
[PDF] Blob URL revoked
```

### Common Issues & Solutions

#### PDF Button Appears Idle
- **Check Console**: Look for `[PDF]` logs
- **Check Downloads Folder**: PDF might have downloaded silently
- **Browser Settings**: Some browsers block downloads, check popup blocker
- **Mobile WebView**: May need to use "Open in Browser" instead of in-app browser

#### Download Opens in New Tab Instead of Downloading
- This is expected fallback behavior
- The PDF will open in viewer, you can save from there
- Check browser download settings

#### No Logs Appearing
- Ensure DevTools Console is open
- Check if console is filtered (remove filters)
- Verify JavaScript is enabled

---

## Mobile Testing Checklist

### Before Testing
- [ ] Device connected via USB
- [ ] USB Debugging enabled
- [ ] Developer Options enabled
- [ ] ADB recognizes device (`adb devices`)

### Test PDF Download
1. [ ] Open app on device
2. [ ] Navigate to Orders page
3. [ ] Filter some orders
4. [ ] Click PDF button
5. [ ] Check Downloads folder on device
6. [ ] Verify PDF opens correctly

### Test Email Verification
1. [ ] Register new account
2. [ ] Check email inbox
3. [ ] Click verification link
4. [ ] Verify success modal appears
5. [ ] Test "Open APP" button

### Test Password Reset
1. [ ] Go to Forgot Password
2. [ ] Enter email
3. [ ] Check email inbox
4. [ ] Click reset link
5. [ ] Set new password
6. [ ] Verify success modal

---

## Debug Logging

All critical features now include detailed console logging:

- **PDF Downloads**: `[PDF]` prefix
- **Orders Page**: `[Orders]` prefix
- **Auth Flow**: Check Supabase auth logs

### Enable Verbose Logging

In browser console, run:
```javascript
localStorage.setItem('debug', 'true');
```

Then reload the page for additional debug output.

---

## Quick Commands

```bash
# Build APK only
npm run apk

# Build and install automatically
npm run apk:auto

# Check connected devices
adb devices

# Install APK manually
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# View device logs
adb logcat

# Clear app data (for testing)
adb shell pm clear com.sareeorder.app
```
