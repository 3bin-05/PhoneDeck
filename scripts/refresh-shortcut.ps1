$sh = New-Object -ComObject WScript.Shell
$lnkPath = "C:\Users\ebin0\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Phone Deck Agent.lnk"
if (Test-Path $lnkPath) {
    $sc = $sh.CreateShortcut($lnkPath)
    Write-Host "Target: $($sc.TargetPath)"
    Write-Host "IconLocation: $($sc.IconLocation)"
    # Re-point explicitly to the agent exe icon
    $sc.IconLocation = "$($sc.TargetPath),0"
    $sc.Save()
    Write-Host "Shortcut refreshed and saved."
} else {
    Write-Host "Shortcut not found at $lnkPath"
}
