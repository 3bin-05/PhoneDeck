$agentExe = "D:\PhoneDeck\target\release\agent.exe"
$agentNsis = "D:\PhoneDeck\target\release\bundle\nsis\Phone Deck Agent_0.1.0_x64-setup.exe"

Copy-Item $agentNsis "D:\PhoneDeck\executable files\PhoneDeck-Agent-Setup.exe" -Force
Copy-Item $agentExe "D:\PhoneDeck\executable files\PhoneDeck-Agent.exe" -Force

Copy-Item $agentNsis "D:\PhoneDeck\dist\PhoneDeck-Agent-Setup.exe" -Force
Copy-Item $agentExe "D:\PhoneDeck\dist\PhoneDeck-Agent.exe" -Force

Get-ChildItem "D:\PhoneDeck\executable files" | Select-Object Name, Length, LastWriteTime
Get-FileHash "D:\PhoneDeck\executable files\*" -Algorithm SHA256 | Select-Object Path, Hash
