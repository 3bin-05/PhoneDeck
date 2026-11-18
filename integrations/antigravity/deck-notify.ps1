# Antigravity Task Complete Wrapper
param (
    [string]$TaskName = "Antigravity Goal Complete",
    [string]$Project = (Split-Path -Leaf (Get-Location).Path),
    [string]$Cwd = (Get-Location).Path
)

$exe = "D:\PhoneDeck\target\debug\phonedeck.exe"
if (-not (Test-Path $exe)) {
    $exe = "phonedeck"
}

& $exe notify --agent "antigravity" --title "$TaskName" --project "$Project" --kind "done" --cwd "$Cwd"
