Add-Type -AssemblyName System.Drawing

$exePath = (Resolve-Path "executable files\PhoneDeck-Agent.exe").Path
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($exePath)
$bmp = $icon.ToBitmap()
Write-Output "Extracted icon size: $($bmp.Width)x$($bmp.Height)"

$mid = $bmp.GetPixel([int]($bmp.Width / 2), [int]($bmp.Height / 2))
$qtr = $bmp.GetPixel([int]($bmp.Width / 3), [int]($bmp.Height / 3))
Write-Output "Extracted icon Mid: R=$($mid.R) G=$($mid.G) B=$($mid.B) A=$($mid.A)"
Write-Output "Extracted icon Qtr: R=$($qtr.R) G=$($qtr.G) B=$($qtr.B)"

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
Write-Output "Has Cyan or Yellow (Tauri logo): $hasCyanOrYellow"

$bmp.Dispose()
$icon.Dispose()
