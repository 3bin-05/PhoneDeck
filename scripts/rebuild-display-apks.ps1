$ErrorActionPreference = "Stop"

$armv7So = "D:\PhoneDeck\target\armv7-linux-androideabi\release\libdisplay_lib.so"
$arm64So = "D:\PhoneDeck\target\aarch64-linux-android\release\libdisplay_lib.so"

$jniArmv7 = "D:\PhoneDeck\apps\display\src-tauri\gen\android\app\src\main\jniLibs\armeabi-v7a"
$jniArm64 = "D:\PhoneDeck\apps\display\src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a"

New-Item -ItemType Directory -Force -Path $jniArmv7 | Out-Null
New-Item -ItemType Directory -Force -Path $jniArm64 | Out-Null

Copy-Item $armv7So "$jniArmv7\libdisplay_lib.so" -Force
Copy-Item $arm64So "$jniArm64\libdisplay_lib.so" -Force

Write-Host "Copied fresh .so files into jniLibs:"
Get-ChildItem -Recurse "D:\PhoneDeck\apps\display\src-tauri\gen\android\app\src\main\jniLibs" | Select-Object FullName, Length, LastWriteTime

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\ebin0\AppData\Local\Android\Sdk"
$env:NDK_HOME = "C:\Users\ebin0\AppData\Local\Android\Sdk\ndk\26.1.10909125"
$env:PATH = "C:\Users\ebin0\AppData\Roaming\npm;$env:JAVA_HOME\bin;$env:PATH"

Set-Location "D:\PhoneDeck\apps\display\src-tauri\gen\android"
Write-Host "Running assembleUniversalRelease..."
.\gradlew.bat assembleUniversalRelease --console=plain

Write-Host "Running assembleArmRelease..."
.\gradlew.bat assembleArmRelease --console=plain

Write-Host "Running assembleArm64Release..."
.\gradlew.bat assembleArm64Release --console=plain
