$sh = New-Object -ComObject WScript.Shell
$lnkPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Phone Deck Agent.lnk"
if (Test-Path $lnkPath) {
    $lnk = $sh.CreateShortcut($lnkPath)
    Write-Output "TargetPath: $($lnk.TargetPath)"
    Write-Output "IconLocation: $($lnk.IconLocation)"
    Write-Output "Arguments: $($lnk.Arguments)"
}
