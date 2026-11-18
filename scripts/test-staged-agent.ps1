$proc = Start-Process -FilePath "D:\PhoneDeck\executable files\PhoneDeck-Agent.exe" -PassThru
Start-Sleep -Seconds 3
Write-Host "Id:" $proc.Id
Write-Host "HasExited:" $proc.HasExited
if (-not $proc.HasExited) {
    Write-Host "SUCCESS: PhoneDeck-Agent.exe started and is running properly without crashing!"
    Stop-Process -Id $proc.Id -Force
} else {
    Write-Host "Failed with ExitCode:" $proc.ExitCode
}
