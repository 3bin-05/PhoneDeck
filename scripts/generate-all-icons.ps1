Add-Type -AssemblyName System.Drawing

$srcPath = (Resolve-Path "Phonedeck.png").Path
$srcBmp = [System.Drawing.Bitmap]::FromFile($srcPath)
Write-Output "Source image: $srcPath ($($srcBmp.Width)x$($srcBmp.Height))"

function Resize-Image([System.Drawing.Image]$src, [int]$width, [int]$height, [bool]$drawCircle = $false) {
    $dest = New-Object System.Drawing.Bitmap $width, $height
    $g = [System.Drawing.Graphics]::FromImage($dest)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    if ($drawCircle) {
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddEllipse(0, 0, $width, $height)
        $g.SetClip($path)
    }

    $g.DrawImage($src, 0, 0, $width, $height)
    $g.Dispose()
    return $dest
}

function Make-AdaptiveForeground([System.Drawing.Image]$src, [int]$totalSize) {
    $dest = New-Object System.Drawing.Bitmap $totalSize, $totalSize
    $g = [System.Drawing.Graphics]::FromImage($dest)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $innerSize = [int]($totalSize * 0.72)
    $offset = [int](($totalSize - $innerSize) / 2)
    $g.DrawImage($src, $offset, $offset, $innerSize, $innerSize)
    $g.Dispose()
    return $dest
}

# 1. Update all desktop icons for both apps (agent and display)
$iconFolders = @("apps\display\src-tauri\icons", "apps\agent\src-tauri\icons")

$allSizes = @(
    @{ name = "32x32.png"; w = 32; h = 32 },
    @{ name = "64x64.png"; w = 64; h = 64 },
    @{ name = "128x128.png"; w = 128; h = 128 },
    @{ name = "128x128@2x.png"; w = 256; h = 256 },
    @{ name = "icon.png"; w = 512; h = 512 },
    @{ name = "Square30x30Logo.png"; w = 30; h = 30 },
    @{ name = "Square44x44Logo.png"; w = 44; h = 44 },
    @{ name = "Square71x71Logo.png"; w = 71; h = 71 },
    @{ name = "Square89x89Logo.png"; w = 89; h = 89 },
    @{ name = "Square107x107Logo.png"; w = 107; h = 107 },
    @{ name = "Square142x142Logo.png"; w = 142; h = 142 },
    @{ name = "Square150x150Logo.png"; w = 150; h = 150 },
    @{ name = "Square284x284Logo.png"; w = 284; h = 284 },
    @{ name = "Square310x310Logo.png"; w = 310; h = 310 },
    @{ name = "StoreLogo.png"; w = 50; h = 50 }
)

foreach ($folder in $iconFolders) {
    foreach ($entry in $allSizes) {
        $out = Join-Path $folder $entry.name
        $resized = Resize-Image $srcBmp $entry.w $entry.h
        $resized.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
        $resized.Dispose()
    }
}
Write-Output "Regenerated all desktop PNG icons (32x32, 128x128, etc.)."

# 2. Build multi-size Windows .ico for agent and display
$icoSizes = @(16, 24, 32, 48, 64, 128, 256)
$icoImages = @()
foreach ($sz in $icoSizes) {
    $bmp = Resize-Image $srcBmp $sz $sz
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $icoImages += , $ms.ToArray()
}

function Save-IcoFile([string]$outPath, $images, $sizes) {
    $fs = [System.IO.File]::Create((Resolve-Path (Split-Path $outPath -Parent)).Path + "\" + (Split-Path $outPath -Leaf))
    $bw = New-Object System.IO.BinaryWriter $fs
    $bw.Write([uint16]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $sz = $sizes[$i]
        $len = $images[$i].Length
        $dim = if ($sz -ge 256) { 0 } else { $sz }
        $bw.Write([byte]$dim)
        $bw.Write([byte]$dim)
        $bw.Write([byte]0)
        $bw.Write([byte]0)
        $bw.Write([uint16]1)
        $bw.Write([uint16]32)
        $bw.Write([uint32]$len)
        $bw.Write([uint32]$offset)
        $offset += $len
    }
    foreach ($imgBytes in $images) {
        $bw.Write([byte[]]$imgBytes)
    }
    $bw.Close()
    Write-Output "Saved .ico file: $outPath ($((Get-Item $outPath).Length) bytes)"
}

Save-IcoFile "apps\display\src-tauri\icons\icon.ico" $icoImages $icoSizes
Save-IcoFile "apps\agent\src-tauri\icons\icon.ico" $icoImages $icoSizes

# 3. Android launcher icons
$densities = @(
    @{ name = "mipmap-mdpi"; legacy = 48; fg = 108 },
    @{ name = "mipmap-hdpi"; legacy = 72; fg = 162 },
    @{ name = "mipmap-xhdpi"; legacy = 96; fg = 216 },
    @{ name = "mipmap-xxhdpi"; legacy = 144; fg = 324 },
    @{ name = "mipmap-xxxhdpi"; legacy = 192; fg = 432 }
)

$resDir = "apps\display\src-tauri\gen\android\app\src\main\res"

foreach ($d in $densities) {
    $targetDir = Join-Path $resDir $d.name
    if (-not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }

    # Standard legacy square/rounded launcher
    $legacy = Resize-Image $srcBmp $d.legacy $d.legacy
    $legacy.Save((Join-Path $targetDir "ic_launcher.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $legacy.Dispose()

    # Round launcher
    $round = Resize-Image $srcBmp $d.legacy $d.legacy $true
    $round.Save((Join-Path $targetDir "ic_launcher_round.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $round.Dispose()

    # Adaptive foreground
    $fg = Make-AdaptiveForeground $srcBmp $d.fg
    $fg.Save((Join-Path $targetDir "ic_launcher_foreground.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $fg.Dispose()

    Write-Output "Generated Android icons for $($d.name)"
}

# 4. Remove vector drawable overrides
$v24Fg = Join-Path $resDir "drawable-v24\ic_launcher_foreground.xml"
if (Test-Path $v24Fg) { Remove-Item -Force $v24Fg }
$bgXml = Join-Path $resDir "drawable\ic_launcher_background.xml"
if (Test-Path $bgXml) { Remove-Item -Force $bgXml }

# 5. values/ic_launcher_background.xml
$valDir = Join-Path $resDir "values"
$valBg = Join-Path $valDir "ic_launcher_background.xml"
Set-Content -Path $valBg -Value '<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="ic_launcher_background">#0D0E12</color>
</resources>' -Encoding utf8

# 6. mipmap-anydpi-v26
$anyDpi = Join-Path $resDir "mipmap-anydpi-v26"
if (-not (Test-Path $anyDpi)) { New-Item -ItemType Directory -Path $anyDpi -Force | Out-Null }

Set-Content -Path (Join-Path $anyDpi "ic_launcher.xml") -Value '<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ic_launcher_background"/>
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>' -Encoding utf8

Set-Content -Path (Join-Path $anyDpi "ic_launcher_round.xml") -Value '<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ic_launcher_background"/>
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>' -Encoding utf8

$srcBmp.Dispose()
Write-Output "All icons generated and synced completely!"
