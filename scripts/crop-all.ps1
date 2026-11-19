Add-Type -AssemblyName System.Drawing

$img = [System.Drawing.Bitmap]::FromFile("d:\PhoneDeck\apps\display\public\ui-reference.jpg")
Write-Host "Image size: $($img.Width) x $($img.Height)"

function CropRect($name, $x, $y, $w, $h) {
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $w, $h), $x, $y, $w, $h, [System.Drawing.GraphicsUnit]::Pixel)
    $bmp.Save("d:\PhoneDeck\apps\display\public\$name.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $g.Dispose()
    Write-Host "Cropped $name ($w x $h)"
}

CropRect "crop-pill" 752 26 242 32
CropRect "crop-clock" 26 68 326 142
CropRect "crop-cpu" 362 70 140 140
CropRect "crop-gpu" 512 70 140 140
CropRect "crop-ram" 662 70 162 140
CropRect "crop-net" 834 70 162 140
CropRect "crop-media" 26 220 442 156
CropRect "crop-review" 478 220 520 90
CropRect "crop-app1" 482 320 96 90
CropRect "crop-app2" 586 320 96 90
CropRect "crop-app3" 690 320 96 90
CropRect "crop-app4" 794 320 96 90
CropRect "crop-app5" 898 320 96 90

$img.Dispose()
