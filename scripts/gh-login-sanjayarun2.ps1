# Reads sanjayarun2 GitHub token from Windows Credential Manager and logs gh in.
$ErrorActionPreference = "Stop"

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class CredMan {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public int Flags;
        public int Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public int CredentialBlobSize;
        public IntPtr CredentialBlob;
        public int Persist;
        public int AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }
    [DllImport("advapi32", SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credPtr);
    [DllImport("advapi32")]
    public static extern void CredFree(IntPtr cred);
}
"@

$targets = @(
  "LegacyGeneric:target=gh:github.com:sanjayarun2",
  "gh:github.com:sanjayarun2"
)

foreach ($t in $targets) {
  $ptr = [IntPtr]::Zero
  if (-not [CredMan]::CredRead($t, 1, 0, [ref]$ptr)) { continue }
  try {
    $cred = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][CredMan+CREDENTIAL])
    $size = $cred.CredentialBlobSize
    $blob = New-Object byte[] $size
    [Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $blob, 0, $size)
    $token = [Text.Encoding]::Unicode.GetString($blob).Trim([char]0)
    if (-not $token) { continue }
    Write-Host "Using stored credential for $($cred.UserName) (target: $t)"
    $token | gh auth login --hostname github.com --git-protocol https --with-token
    gh auth status
    exit 0
  } finally {
    [CredMan]::CredFree($ptr) | Out-Null
  }
}

Write-Error "Could not read sanjayarun2 GitHub token from Credential Manager."
exit 1
