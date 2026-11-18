$uni = "D:\PhoneDeck\apps\display\src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk"
$arm = "D:\PhoneDeck\apps\display\src-tauri\gen\android\app\build\outputs\apk\arm\release\app-arm-release.apk"
$arm64 = "D:\PhoneDeck\apps\display\src-tauri\gen\android\app\build\outputs\apk\arm64\release\app-arm64-release.apk"

Copy-Item $uni "D:\PhoneDeck\executable files\PhoneDeck-Display.apk" -Force
Copy-Item $uni "D:\PhoneDeck\dist\PhoneDeck-Display.apk" -Force

Copy-Item $arm "D:\PhoneDeck\executable files\PhoneDeck-Display-armv7.apk" -Force
Copy-Item $arm64 "D:\PhoneDeck\executable files\PhoneDeck-Display-arm64.apk" -Force

Get-ChildItem "D:\PhoneDeck\executable files" | Select-Object Name, Length, LastWriteTime
