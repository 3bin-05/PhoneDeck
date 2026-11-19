$ErrorActionPreference = "Stop"

Write-Host "Building frontends..."
& pnpm -r build

Write-Host "`nBuilding Windows Tauri Agent Installer (NSIS)..."
& npx @tauri-apps/cli build --config apps/agent/src-tauri/tauri.conf.json

Write-Host "`nStaging agent executables..."
& powershell -ExecutionPolicy Bypass -File scripts\copy-agent.ps1

Write-Host "`nDesktop Agent build complete!"
