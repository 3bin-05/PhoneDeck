# Claude Code PreToolUse Hook - Blocks for Phone Deck Approval
param (
    [string]$Command = $env:CLAUDE_TOOL_COMMAND,
    [string]$ToolName = $env:CLAUDE_TOOL_NAME
)

$prompt = "Execute tool: $ToolName"
if ($Command) {
    $prompt = "Run command: $Command"
}

Write-Host "[Phone Deck] Requesting remote approval on Phone Deck screen..."

$exe = "D:\PhoneDeck\target\debug\phonedeck.exe"
if (-not (Test-Path $exe)) {
    $exe = "phonedeck"
}

& $exe ask "$prompt" --command "$Command" --timeout 60
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    Write-Host "[Phone Deck] Approved by Phone Deck. Proceeding."
    exit 0
} elseif ($exitCode -eq 1) {
    Write-Error "[Phone Deck] DENIED by Phone Deck operator."
    exit 1
} else {
    Write-Warning "[Phone Deck] Approval timed out or Phone Deck offline. Falling back to local prompt."
    exit 2
}
