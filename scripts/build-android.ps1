$ErrorActionPreference = "Stop"

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\ebin0\AppData\Local\Android\Sdk"
$env:NDK_HOME = "C:\Users\ebin0\AppData\Local\Android\Sdk\ndk\26.1.10909125"
$env:PATH = "C:\Users\ebin0\AppData\Roaming\npm;$env:JAVA_HOME\bin;$env:PATH"

# 1. Recompile armv7 Rust library (with fresh dist embedded)
Write-Host "Step 1: Compiling Rust display_lib for armv7..."
& "D:\PhoneDeck\scripts\compile-armv7.ps1"

# 2. Recompile aarch64 Rust library (with fresh dist embedded)
Write-Host "Step 2: Compiling Rust display_lib for aarch64..."
& "D:\PhoneDeck\scripts\compile-aarch64.ps1"

# 3. Copy compiled .so binaries to jniLibs
$jniV7 = "D:\PhoneDeck\apps\display\src-tauri\gen\android\app\src\main\jniLibs\armeabi-v7a"
$jniV8 = "D:\PhoneDeck\apps\display\src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a"
New-Item -ItemType Directory -Path $jniV7 -Force | Out-Null
New-Item -ItemType Directory -Path $jniV8 -Force | Out-Null

Copy-Item "D:\PhoneDeck\target\armv7-linux-androideabi\release\libdisplay_lib.so" "$jniV7\libdisplay_lib.so" -Force
Copy-Item "D:\PhoneDeck\target\aarch64-linux-android\release\libdisplay_lib.so" "$jniV8\libdisplay_lib.so" -Force
Write-Host "Copied updated .so binaries to jniLibs."

# 4. Sync web dist to Android assets
Write-Host "Step 3: Syncing frontend assets from dist to Android main/assets..."
Remove-Item "D:\PhoneDeck\apps\display\src-tauri\gen\android\app\src\main\assets\*" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item "D:\PhoneDeck\apps\display\dist\*" "D:\PhoneDeck\apps\display\src-tauri\gen\android\app\src\main\assets\" -Recurse -Force

Set-Location "D:\PhoneDeck\apps\display\src-tauri\gen\android"

# 5. Gradle clean & assemble
Write-Host "Step 4: Running Gradle clean..."
.\gradlew.bat clean --console=plain

Write-Host "Step 5: Running Gradle assembleUniversalRelease..."
.\gradlew.bat assembleUniversalRelease --console=plain

Write-Host "Step 6: Running Gradle assembleArmRelease..."
.\gradlew.bat assembleArmRelease --console=plain

Write-Host "Step 7: Running Gradle assembleArm64Release..."
.\gradlew.bat assembleArm64Release --console=plain

$uni = "D:\PhoneDeck\apps\display\src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk"
$arm = "D:\PhoneDeck\apps\display\src-tauri\gen\android\app\build\outputs\apk\arm\release\app-arm-release.apk"
$arm64 = "D:\PhoneDeck\apps\display\src-tauri\gen\android\app\build\outputs\apk\arm64\release\app-arm64-release.apk"

Copy-Item $uni "D:\PhoneDeck\executable files\PhoneDeck-Display.apk" -Force
Copy-Item $arm "D:\PhoneDeck\executable files\PhoneDeck-Display-armv7.apk" -Force
if (Test-Path $arm64) {
    Copy-Item $arm64 "D:\PhoneDeck\executable files\PhoneDeck-Display-arm64.apk" -Force
}

Copy-Item $uni "D:\PhoneDeck\dist\PhoneDeck-Display.apk" -Force

Write-Host "APKs compiled and staged successfully!"
Set-Location "D:\PhoneDeck"
Get-ChildItem "D:\PhoneDeck\executable files\*.apk" | Select-Object Name, Length, LastWriteTime
