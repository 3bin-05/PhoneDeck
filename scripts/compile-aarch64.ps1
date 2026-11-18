$ErrorActionPreference = "Stop"

$ndkBin = "C:\Users\ebin0\AppData\Local\Android\Sdk\ndk\26.1.10909125\toolchains\llvm\prebuilt\windows-x86_64\bin"
$env:PATH = "$ndkBin;$env:PATH"

$env:CC_aarch64_linux_android = "$ndkBin\aarch64-linux-android23-clang.cmd"
$env:CXX_aarch64_linux_android = "$ndkBin\aarch64-linux-android23-clang++.cmd"
$env:AR_aarch64_linux_android = "$ndkBin\llvm-ar.exe"
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = "$ndkBin\aarch64-linux-android23-clang.cmd"

Write-Host "Building display_lib for aarch64-linux-android (API 23)..."
cargo build --package display --lib --target aarch64-linux-android --release
