Add-Type -AssemblyName System.Drawing

$installedExe = "C:\Users\ebin0\AppData\Local\Phone Deck Agent\agent.exe"
if (Test-Path $installedExe) {
    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($installedExe)
    $bmp = $icon.ToBitmap()
    Write-Output "Installed agent.exe size: $($bmp.Width)x$($bmp.Height)"

    # Check if there is cyan or yellow
    $hasCyanOrYellow = $false
    for ($x = 0; $x -lt $bmp.Width; $x++) {
        for ($y = 0; $y -lt $bmp.Height; $y++) {
            $c = $bmp.GetPixel($x, $y)
            if (($c.R -gt 200 -and $c.G -gt 150 -and $c.B -lt 50) -or ($c.R -lt 50 -and $c.G -gt 150 -and $c.B -gt 150)) {
                $hasCyanOrYellow = $true
                break
            }
        }
    }
    Write-Output "Installed agent.exe has Cyan or Yellow (Tauri logo): $hasCyanOrYellow"
    $bmp.Dispose()
    $icon.Dispose()
} else {
    Write-Output "Installed agent.exe not found at $installedExe"
}
