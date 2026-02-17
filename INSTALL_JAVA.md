# Installing Java 17 JDK for Android Build

## Why Java 17 JDK is Required

Android builds using Gradle require Java JDK (not just JRE). Java 17 is the recommended version for modern Android development.

## Quick Installation Guide

### Option 1: Eclipse Temurin (Adoptium) - Recommended

1. **Download Java 17 JDK:**
   - Visit: https://adoptium.net/temurin/releases/?version=17
   - If page shows "No releases found":
     - Click "JDK 17 - LTS" from the version menu
     - Or use direct link: https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse

2. **Install:**
   - Download the `.msi` installer for Windows x64
   - Run the installer
   - **IMPORTANT:** Check the box "Set JAVA_HOME variable" during installation
   - Complete the installation

3. **Verify:**
   - Close and reopen PowerShell
   - Run: `java -version`
   - Should show: `openjdk version "17.x.x"`

### Option 2: Microsoft OpenJDK 17

1. **Download:**
   - Visit: https://learn.microsoft.com/en-us/java/openjdk/download#openjdk-17
   - Download Windows x64 installer

2. **Install:**
   - Run installer
   - Check "Set JAVA_HOME variable" option
   - Complete installation

3. **Verify:**
   - Restart PowerShell
   - Run: `java -version`

### Option 3: Oracle JDK 17

1. **Download:**
   - Visit: https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html
   - Requires free Oracle account
   - Download Windows x64 installer

2. **Install:**
   - Run installer
   - Set JAVA_HOME manually if needed

## Manual JAVA_HOME Setup (if installer doesn't set it)

If JAVA_HOME is not set automatically:

1. **Find Java installation:**
   - Usually: `C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot\`
   - Or: `C:\Program Files\Microsoft\jdk-17.x.x\`

2. **Set JAVA_HOME:**
   - Press `Win + X` → System → Advanced system settings
   - Click "Environment Variables"
   - Under "User variables", click "New"
   - Variable name: `JAVA_HOME`
   - Variable value: `C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot` (your actual path)
   - Click OK

3. **Add to PATH:**
   - Edit "Path" variable
   - Add: `%JAVA_HOME%\bin`
   - Click OK

4. **Restart PowerShell** and verify:
   ```powershell
   java -version
   echo $env:JAVA_HOME
   ```

## After Installation

Once Java 17 JDK is installed:

```powershell
cd C:\Users\sanjay_arun2\Downloads\Saree_order_App
npm run apk:auto
```

The script will automatically detect Java and proceed with the build!

## Troubleshooting

**"Java not found" after installation:**
- Restart PowerShell/terminal
- Verify: `java -version`
- Check JAVA_HOME: `echo $env:JAVA_HOME`

**"JAVA_HOME not set":**
- Follow manual setup steps above
- Or reinstall Java and check "Set JAVA_HOME" option

**Wrong Java version:**
- Make sure you installed JDK 17 (not JRE or older version)
- Verify: `java -version` shows version 17
