$setup = "target\release\bundle\nsis\Phone Deck Agent_0.1.1_x64-setup.exe"
$exe = "target\release\agent.exe"

Copy-Item $setup "executable files\PhoneDeck-Agent-Setup.exe" -Force
Copy-Item $exe "executable files\PhoneDeck-Agent.exe" -Force
Copy-Item $setup "dist\PhoneDeck-Agent-Setup.exe" -Force
Copy-Item $exe "dist\PhoneDeck-Agent.exe" -Force

Get-ChildItem "executable files\*agent*" | Select-Object Name, Length, LastWriteTime
