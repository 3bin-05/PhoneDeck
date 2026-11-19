$ErrorActionPreference = "Stop"

$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot"
$env:ANDROID_HOME = "C:\Users\ebin0\AppData\Local\Android\Sdk"
$env:NDK_HOME = "C:\Users\ebin0\AppData\Local\Android\Sdk\ndk\26.1.10909125"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

Write-Host "Building display frontend..."
& pnpm --filter @phone-deck/display build

Write-Host "`nSyncing dist assets to Android app/src/main/assets..."
$assetsDst = "apps\display\src-tauri\gen\android\app\src\main\assets"
if (!(Test-Path $assetsDst)) {
    New-Item -ItemType Directory -Path $assetsDst -Force | Out-Null
}
Copy-Item "apps\display\dist\*" $assetsDst -Recurse -Force

Write-Host "`nCopying compiled JNI libraries..."
$arm64Dst = "apps\display\src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a"
$armv7Dst = "apps\display\src-tauri\gen\android\app\src\main\jniLibs\armeabi-v7a"

if (!(Test-Path $arm64Dst)) { New-Item -ItemType Directory -Path $arm64Dst -Force | Out-Null }
if (!(Test-Path $armv7Dst)) { New-Item -ItemType Directory -Path $armv7Dst -Force | Out-Null }

if (Test-Path "target\aarch64-linux-android\release\libdisplay_lib.so") {
    Copy-Item "target\aarch64-linux-android\release\libdisplay_lib.so" "$arm64Dst\libdisplay_lib.so" -Force
    Write-Host "  Copied aarch64 (arm64-v8a) libdisplay_lib.so"
}
if (Test-Path "target\armv7-linux-androideabi\release\libdisplay_lib.so") {
    Copy-Item "target\armv7-linux-androideabi\release\libdisplay_lib.so" "$armv7Dst\libdisplay_lib.so" -Force
    Write-Host "  Copied armv7 (armeabi-v7a) libdisplay_lib.so"
}

Write-Host "`nRunning Gradle assemble..."
Push-Location "apps\display\src-tauri\gen\android"
try {
    & .\gradlew assembleRelease assembleDebug
} finally {
    Pop-Location
}

Write-Host "`nLocating built APKs..."
$apks = Get-ChildItem "apps\display\src-tauri\gen\android\app\build\outputs\apk" -Recurse -Filter "*.apk"
foreach ($apk in $apks) {
    Write-Host "Found APK: $($apk.FullName) ($($apk.Length) bytes)"
    Copy-Item $apk.FullName "executable files\" -Force
    Copy-Item $apk.FullName "dist\" -Force
}

Get-ChildItem "executable files\*.apk" | Select-Object Name, Length, LastWriteTime
