$ErrorActionPreference = "Stop"

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\ebin0\AppData\Local\Android\Sdk"
$env:NDK_HOME = "C:\Users\ebin0\AppData\Local\Android\Sdk\ndk\26.1.10909125"
$env:PATH = "C:\Users\ebin0\AppData\Roaming\npm;$env:JAVA_HOME\bin;$env:PATH"

Write-Host "Syncing frontend assets from dist to Android main/assets..."
Copy-Item "D:\PhoneDeck\apps\display\dist\*" "D:\PhoneDeck\apps\display\src-tauri\gen\android\app\src\main\assets\" -Recurse -Force

Set-Location "D:\PhoneDeck\apps\display\src-tauri\gen\android"

Write-Host "Running Gradle assembleUniversalRelease..."
.\gradlew.bat assembleUniversalRelease --console=plain --rerun-tasks

Write-Host "Running Gradle assembleArmRelease..."
.\gradlew.bat assembleArmRelease --console=plain

Write-Host "Running Gradle assembleArm64Release..."
.\gradlew.bat assembleArm64Release --console=plain

$uni = "D:\PhoneDeck\apps\display\src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk"
$arm = "D:\PhoneDeck\apps\display\src-tauri\gen\android\app\build\outputs\apk\arm\release\app-arm-release.apk"
$arm64 = "D:\PhoneDeck\apps\display\src-tauri\gen\android\app\build\outputs\apk\arm64\release\app-arm64-release.apk"

Copy-Item $uni "D:\PhoneDeck\executable files\PhoneDeck-Display.apk" -Force
Copy-Item $arm "D:\PhoneDeck\executable files\PhoneDeck-Display-armv7.apk" -Force
if (Test-Path $arm64) {
    Copy-Item $arm64 "D:\PhoneDeck\executable files\PhoneDeck-Display-arm64.apk" -Force
}
Write-Host "APKs copied successfully to executable files!"
