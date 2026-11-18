$ErrorActionPreference = "Stop"

$ndkBin = "C:\Users\ebin0\AppData\Local\Android\Sdk\ndk\26.1.10909125\toolchains\llvm\prebuilt\windows-x86_64\bin"
$env:PATH = "$ndkBin;$env:PATH"

$linker = "D:\PhoneDeck\scripts\armv7a-linker.bat"
$env:CC_armv7_linux_androideabi = $linker
$env:CXX_armv7_linux_androideabi = $linker
$env:AR_armv7_linux_androideabi = "$ndkBin\llvm-ar.exe"
$env:CFLAGS_armv7_linux_androideabi = "-march=armv7-a"
$env:CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER = $linker

Write-Host "Building display_lib for armv7-linux-androideabi (API 23)..."
cargo build --package display --lib --target armv7-linux-androideabi --release
