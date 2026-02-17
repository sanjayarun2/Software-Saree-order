# Debug Guide for Saree Order App

## Quick Commands

### Basic Debugging

```powershell
# Show filtered logs (saree app only)
npm run debug

# Clear logs and start fresh
npm run debug:clear

# Show all logs (no filter)
npm run debug:all
```

### Advanced Debugging

```powershell
# Show only errors and warnings
powershell -ExecutionPolicy Bypass -File debug-commands.ps1 errors

# Check for crashes
powershell -ExecutionPolicy Bypass -File debug-commands.ps1 crash

# Show app package info
powershell -ExecutionPolicy Bypass -File debug-commands.ps1 package

# Show device information
powershell -ExecutionPolicy Bypass -File debug-commands.ps1 info

# Clear log buffer
powershell -ExecutionPolicy Bypass -File debug-commands.ps1 clear
```

## What the Logs Show

From the current logs, you can see:

✅ **App is running**: `com.sareeorder.app` is active
✅ **Capacitor working**: Preferences plugin callbacks visible
✅ **Auth system**: Checking for Supabase auth tokens
✅ **App displayed**: `Displayed com.sareeorder.app/.MainActivity`

### Key Log Patterns

**App Startup:**
```
I .sareeorder.app: Late-enabling -Xcheck:jni
I ActivityTaskManager: Displayed com.sareeorder.app/.MainActivity
```

**Capacitor Operations:**
```
V Capacitor: callback: ..., pluginId: Preferences, methodName: get
```

**Errors (if any):**
```
E .sareeorder.app: [error message]
```

**Warnings:**
```
W .sareeorder.app: [warning message]
```

## Debugging Workflow

1. **Start Debug Session:**
   ```powershell
   npm run debug:clear
   ```
   This clears old logs and starts fresh

2. **Reproduce Issue:**
   - Use the app on your phone
   - Perform the action that causes problems

3. **Watch Logs:**
   - Logs appear in real-time
   - Look for errors (marked with `E`)
   - Look for warnings (marked with `W`)

4. **Filter Specific Issues:**
   ```powershell
   # If looking for network errors
   adb logcat | findstr /i "network|http|error"
   
   # If looking for JavaScript errors
   adb logcat | findstr /i "chromium|webview|console"
   ```

## Common Issues & Solutions

### App Not Starting
- Check for: `FATAL EXCEPTION` or `AndroidRuntime`
- Solution: Check app permissions, verify Supabase config

### Network Errors
- Look for: `NetworkException`, `SocketTimeoutException`
- Solution: Check internet connection, verify Supabase URL

### JavaScript Errors
- Look for: `chromium`, `console.error`, `Uncaught`
- Solution: Check browser console in DevTools, verify code

### Auth Issues
- Look for: `auth-token` related logs
- Solution: Check Supabase credentials, verify auth flow

## Tips

1. **Clear logs before testing** to reduce noise:
   ```powershell
   npm run debug:clear
   ```

2. **Use filters** to focus on specific issues:
   ```powershell
   # Filter for errors only
   adb logcat *:E
   
   # Filter for specific tag
   adb logcat -s Capacitor:V
   ```

3. **Save logs to file** for analysis:
   ```powershell
   adb logcat > app-logs.txt
   ```

4. **Monitor specific app only:**
   ```powershell
   adb logcat | findstr "com.sareeorder.app"
   ```

## Scripts Available

- **`debug-app.ps1`** - Main debug script with filtering
- **`debug-commands.ps1`** - Individual debug commands
- **`download-and-install.ps1`** - Download & install APK from GitHub

## Next Steps

1. Keep debug script running while testing
2. Watch for errors when issues occur
3. Copy relevant log lines for troubleshooting
4. Use filtered views to focus on specific problems

Happy debugging! 🐛🔍
