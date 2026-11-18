$proc = Start-Process -FilePath "D:\PhoneDeck\target\release\agent.exe" -PassThru
$sw = [System.Diagnostics.Stopwatch]::StartNew()
while (-not $proc.HasExited -and $sw.ElapsedMilliseconds -lt 10000) {
    Start-Sleep -Milliseconds 250
}
Write-Host "Process Id:" $proc.Id
Write-Host "HasExited:" $proc.HasExited
if ($proc.HasExited) {
    Write-Host "ExitCode:" $proc.ExitCode
    Write-Host "Ran for (ms):" $sw.ElapsedMilliseconds
} else {
    Write-Host "Still running after 10s!"
    Stop-Process -Id $proc.Id -Force
}
