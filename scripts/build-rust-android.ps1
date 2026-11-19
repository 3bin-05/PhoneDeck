$ErrorActionPreference = "Stop"

$ndkBin = "C:\Users\ebin0\AppData\Local\Android\Sdk\ndk\26.1.10909125\toolchains\llvm\prebuilt\windows-x86_64\bin"
$env:PATH = "$ndkBin;$env:PATH"
$env:CC_armv7_linux_androideabi = "$ndkBin\armv7a-linux-androideabi23-clang.cmd"
$env:AR_armv7_linux_androideabi = "$ndkBin\llvm-ar.exe"
$env:CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER = "$ndkBin\armv7a-linux-androideabi23-clang.cmd"

$env:CC_aarch64_linux_android = "$ndkBin\aarch64-linux-android23-clang.cmd"
$env:AR_aarch64_linux_android = "$ndkBin\llvm-ar.exe"
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = "$ndkBin\aarch64-linux-android23-clang.cmd"

Write-Host "=== Compiling armv7-linux-androideabi release ==="
cargo build --manifest-path apps/display/src-tauri/Cargo.toml --lib --target armv7-linux-androideabi --release

Write-Host "=== Compiling aarch64-linux-android release ==="
cargo build --manifest-path apps/display/src-tauri/Cargo.toml --lib --target aarch64-linux-android --release

Write-Host "=== Copying fresh .so files to jniLibs ==="
New-Item -ItemType Directory -Force -Path "apps/display/src-tauri/gen/android/app/src/main/jniLibs/armeabi-v7a"
New-Item -ItemType Directory -Force -Path "apps/display/src-tauri/gen/android/app/src/main/jniLibs/arm64-v8a"
Copy-Item "target/armv7-linux-androideabi/release/libdisplay_lib.so" "apps/display/src-tauri/gen/android/app/src/main/jniLibs/armeabi-v7a/libdisplay_lib.so" -Force
Copy-Item "target/aarch64-linux-android/release/libdisplay_lib.so" "apps/display/src-tauri/gen/android/app/src/main/jniLibs/arm64-v8a/libdisplay_lib.so" -Force

Write-Host "=== Rust Android builds complete ==="
