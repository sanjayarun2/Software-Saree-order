# Setting Up ADB (Android Debug Bridge)

## Quick Setup Guide

### Option 1: Extract Platform Tools (Recommended)

1. **Find the downloaded file** in your Downloads folder:
   - Look for `platform-tools-*.zip` or similar
   - Or check recent downloads

2. **Extract the ZIP file**:
   - Right-click → Extract All
   - Extract to: `C:\Users\sanjay_arun2\Downloads\platform-tools\`

3. **Verify ADB exists**:
   - You should see `adb.exe` in `C:\Users\sanjay_arun2\Downloads\platform-tools\`

4. **Run the script**:
   ```powershell
   npm run apk:auto
   ```
   The script will automatically find ADB in Downloads!

### Option 2: Add to PATH (Permanent)

1. **Extract platform-tools** to a permanent location:
   - Example: `C:\Android\platform-tools\`

2. **Add to PATH**:
   - Press `Win + X` → System → Advanced system settings
   - Click "Environment Variables"
   - Under "User variables", select "Path" → Edit
   - Click "New" → Add: `C:\Android\platform-tools`
   - Click OK on all dialogs

3. **Restart PowerShell** and verify:
   ```powershell
   adb version
   ```

### Option 3: Use Script Auto-Detection

The `build-and-install.ps1` script automatically searches these locations:
- `%USERPROFILE%\Downloads\platform-tools\adb.exe`
- `%USERPROFILE%\Downloads\adb.exe`
- `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`
- `%ProgramFiles%\Android\android-sdk\platform-tools\adb.exe`

Just extract platform-tools to Downloads and the script will find it!

## Verify Setup

Run this to check if ADB is found:
```powershell
cd C:\Users\sanjay_arun2\Downloads\Saree_order_App
npm run apk:auto
```

If ADB is found, you'll see:
```
[OK] ADB found in PATH
```
or
```
Found ADB at: C:\Users\sanjay_arun2\Downloads\platform-tools\adb.exe
```

## Troubleshooting

**"ADB not found" error:**
- Make sure platform-tools.zip is extracted
- Check that `adb.exe` exists in the extracted folder
- Try placing `adb.exe` directly in Downloads folder

**"No Android device found" error:**
- Connect phone via USB
- Enable USB Debugging (Settings → Developer Options)
- Accept the USB debugging prompt on your phone
- Check: `adb devices` (should show your device)
