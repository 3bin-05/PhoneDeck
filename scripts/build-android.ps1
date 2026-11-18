$ErrorActionPreference = "Stop"

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\ebin0\AppData\Local\Android\Sdk"
$env:NDK_HOME = "C:\Users\ebin0\AppData\Local\Android\Sdk\ndk\26.1.10909125"
$env:PATH = "C:\Users\ebin0\AppData\Roaming\npm;$env:JAVA_HOME\bin;$env:PATH"

Set-Location "D:\PhoneDeck\apps\display\src-tauri\gen\android"

Write-Host "Running Gradle assembleUniversalRelease..."
.\gradlew.bat assembleUniversalRelease --console=plain

Write-Host "Running Gradle assembleArmRelease..."
.\gradlew.bat assembleArmRelease --console=plain
