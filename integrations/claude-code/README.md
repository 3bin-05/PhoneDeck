# Claude Code Phone Deck Integration

This integration connects Anthropic's Claude Code CLI with Phone Deck.

## Hook Events
- **`Stop`**: Triggers when Claude Code finishes a response/turn. Phone Deck collects `git diff --shortstat` and displays a completion card with additions, deletions, and duration on your phone.
- **`Notification`**: Pushes alerts when Claude requires user attention or displays a system notification.
- **`PreToolUse`**: Blocks execution of shell commands and tools until you tap **Approve** on your phone deck (or 60s timeout falls back to terminal).

## Installation
Add the contents of `settings-snippet.json` to your `~/.claude/settings.json`.
