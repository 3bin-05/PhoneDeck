$ErrorActionPreference = "Stop"

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

$apk = "D:\PhoneDeck\apps\display\src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk"
Write-Host "--- Verifying Universal Release APK ---"
& "C:\Users\ebin0\AppData\Local\Android\Sdk\build-tools\36.0.0\apksigner.bat" verify --verbose $apk

& "C:\Users\ebin0\AppData\Local\Android\Sdk\build-tools\36.0.0\aapt.exe" dump badging $apk | Select-String "minSdkVersion|targetSdkVersion|package:|native-code:"
