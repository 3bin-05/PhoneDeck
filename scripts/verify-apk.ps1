$ErrorActionPreference = "Stop"

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

$apk = "D:\PhoneDeck\apps\display\src-tauri\gen\android\app\build\outputs\apk\arm64\release\app-arm64-release.apk"
Write-Host "Verifying APK signature:"
& "C:\Users\ebin0\AppData\Local\Android\Sdk\build-tools\36.0.0\apksigner.bat" verify --verbose $apk

Write-Host "`nDumping badging info:"
& "C:\Users\ebin0\AppData\Local\Android\Sdk\build-tools\36.0.0\aapt2.exe" dump badging $apk | Select-String "minSdkVersion|targetSdkVersion|package:"
