# Codex Notify Adapter - Dispatches completed turn to Phone Deck
param (
    [string]$Project = (Split-Path -Leaf (Get-Location).Path),
    [string]$Cwd = (Get-Location).Path
)

$exe = "D:\PhoneDeck\target\debug\phonedeck.exe"
if (-not (Test-Path $exe)) {
    $exe = "phonedeck"
}

& $exe notify --agent "codex" --title "Codex Turn Complete" --project "$Project" --kind "done" --cwd "$Cwd"
