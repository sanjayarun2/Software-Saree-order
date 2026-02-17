# Install APK from GitHub Actions

This guide shows how to download and install the APK built by GitHub Actions on your mobile device.

## Quick Method (Automated Script)

### Option 1: Manual Download (Easiest)

1. **Download APK from GitHub:**
   - Go to your GitHub repo → **Actions** tab
   - Click on the latest successful workflow run
   - Scroll down to **Artifacts** section
   - Download `saree-order-book-apk.zip`
   - Extract the ZIP file
   - Copy `app-debug.apk` to your Downloads folder

2. **Run install script:**
   ```powershell
   npm run apk:install
   ```
   
   The script will automatically find the APK in Downloads and install it!

### Option 2: Automatic Download (Requires GitHub Token)

If you want the script to automatically download from GitHub:

1. **Create GitHub Personal Access Token:**
   - Go to: https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Name: "APK Download"
   - Check: `public_repo` (or `repo` for private repos)
   - Generate and copy the token

2. **Run script with repo name:**
   ```powershell
   npm run apk:install -- -GitHubRepo "your-username/your-repo-name"
   ```

   Or with token (for private repos):
   ```powershell
   npm run apk:install -- -GitHubRepo "your-username/your-repo-name" -GitHubToken "your-token"
   ```

## Manual Installation

If you prefer to install manually:

1. **Download APK** from GitHub Actions (as described above)

2. **Connect your phone** via USB

3. **Enable USB Debugging:**
   - Settings → About Phone → Tap "Build Number" 7 times
   - Settings → Developer Options → Enable "USB Debugging"

4. **Install via ADB:**
   ```powershell
   cd C:\Users\sanjay_arun2\Downloads\platform-tools
   .\adb.exe install -r "C:\Users\sanjay_arun2\Downloads\app-debug.apk"
   ```

## Debugging the App

After installation, you can view logs:

```powershell
# View all logs
cd C:\Users\sanjay_arun2\Downloads\platform-tools
.\adb.exe logcat

# Filter for your app
.\adb.exe logcat | findstr /i "saree"

# Clear logs and watch new ones
.\adb.exe logcat -c
.\adb.exe logcat
```

## Troubleshooting

**"ADB not found":**
- Make sure platform-tools is extracted to Downloads
- Or add platform-tools to PATH

**"No device found":**
- Connect phone via USB
- Enable USB Debugging
- Accept USB debugging prompt on phone
- Check: `adb devices`

**"APK not found":**
- Download APK from GitHub Actions manually
- Place it in Downloads folder as `app-debug.apk`
- Run script again

**"Installation failed":**
- Make sure USB Debugging is enabled
- Try: `adb install -r app-debug.apk` manually
- Check phone screen for installation prompts

## Workflow

1. **Push code to GitHub** → GitHub Actions builds APK automatically
2. **Download APK** from Actions artifacts
3. **Run install script** → Installs on connected device
4. **Test and debug** → Use `adb logcat` to view logs

No need to install Java or build locally! 🎉
