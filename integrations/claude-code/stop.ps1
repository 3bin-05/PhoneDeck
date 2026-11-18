# Claude Code Stop Hook - Triggers Phone Deck Done Event with Git Diff Summary
param (
    [string]$Project = $env:CLAUDE_PROJECT_NAME,
    [string]$Cwd = $env:CLAUDE_PROJECT_DIR
)

if (-not $Cwd) {
    $Cwd = (Get-Location).Path
}
if (-not $Project) {
    $Project = (Split-Path -Leaf $Cwd)
}

Write-Host "[Phone Deck] Dispatching task-complete to phone deck..."

# Call phonedeck CLI
$exe = "D:\PhoneDeck\target\debug\phonedeck.exe"
if (-not (Test-Path $exe)) {
    $exe = "phonedeck"
}

& $exe notify --agent "claude-code" --title "Claude Code Finished" --project "$Project" --kind "done" --cwd "$Cwd"
