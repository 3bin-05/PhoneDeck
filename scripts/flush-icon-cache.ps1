# Notify Windows Shell of association / icon change
$code = @"
using System;
using System.Runtime.InteropServices;

public class ShellIconNotifier {
    [DllImport("shell32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);

    public const uint SHCNE_ASSOCCHANGED = 0x08000000;
    public const uint SHCNF_IDLIST = 0x0000;

    public static void Refresh() {
        SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, IntPtr.Zero, IntPtr.Zero);
    }
}
"@

Add-Type -TypeDefinition $code -Language CSharp
[ShellIconNotifier]::Refresh()
Write-Host "Shell icon notification sent."

# Also run ie4uinit if available
if (Get-Command ie4uinit.exe -ErrorAction SilentlyContinue) {
    Start-Process ie4uinit.exe -ArgumentList "-show" -Wait -ErrorAction SilentlyContinue
    Write-Host "ie4uinit executed."
}
