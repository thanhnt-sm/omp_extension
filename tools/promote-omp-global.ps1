[CmdletBinding()]
param(
  [switch]$DryRun,
  [switch]$Bootstrap
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$toolsDirectory = Split-Path -Parent $PSCommandPath
$syncScript = Join-Path $toolsDirectory "sync-baseline.cjs"
$homeDirectory = if ($env:OMP_HOME_DIR) { [IO.Path]::GetFullPath($env:OMP_HOME_DIR) } else { [Environment]::GetFolderPath("UserProfile") }
$targetDirectory = if ($env:OMP_TARGET_DIR) { [IO.Path]::GetFullPath($env:OMP_TARGET_DIR) } else { Join-Path $homeDirectory "Projects\omp_extension" }
$pointerPath = if ($env:OMP_EXTENSION_POINTER) { [IO.Path]::GetFullPath($env:OMP_EXTENSION_POINTER) } else { Join-Path $homeDirectory ".omp\agent\extensions\typesafe-planner.ts" }
$expectedPointer = "export { default } from `"$($targetDirectory.Replace('\', '/'))/typesafe-planner.ts`";"

function Write-Section([string]$message) {
  Write-Host ""
  Write-Host "[>] $message" -ForegroundColor Cyan
}

function Test-ImmutablePointer {
  if (-not (Test-Path -LiteralPath $pointerPath -PathType Leaf)) {
    return $false
  }

  $bytes = [IO.File]::ReadAllBytes($pointerPath)
  if ($bytes.Contains([byte]0)) {
    return $false
  }
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    return $false
  }

  $content = [Text.Encoding]::UTF8.GetString($bytes)
  return $content -eq $expectedPointer -or $content -eq "$expectedPointer`n" -or $content -eq "$expectedPointer`r`n"
}

function Show-PointerRepairGuide {
  Write-Host "[!] OMP loader proxy is not in the required immutable one-line format." -ForegroundColor Yellow
  Write-Host "[!] This helper will NOT write or repair the proxy."
  Write-Host ""
  Write-Host "File to repair manually:"
  Write-Host "  $pointerPath"
  Write-Host ""
  Write-Host "Replace the entire file with exactly:"
  Write-Host "  $expectedPointer"
  Write-Host ""
  Write-Host "No BOM, comments, or extra statements. One final newline is allowed."
}

function Invoke-Sync([switch]$ReadOnly) {
  $arguments = @($syncScript)
  if ($ReadOnly) {
    $arguments += "--dry-run"
  }
  if ($Bootstrap) {
    $arguments += "--bootstrap"
  }

  & node @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "sync-baseline failed with exit code $LASTEXITCODE"
  }
}

if (-not (Test-Path -LiteralPath $syncScript -PathType Leaf)) {
  throw "Missing deployment entry point: $syncScript"
}
if ($env:OMP_SKIP_VERIFY_TESTS -eq "1") {
  throw "OMP_SKIP_VERIFY_TESTS=1 is not allowed for global promotion. Remove it and run again."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required but was not found on PATH."
}

Write-Section "OMP global promotion helper"
Write-Host "Workspace deployment entry point: $syncScript"
Write-Host "Target: $targetDirectory"
Write-Host "Immutable loader proxy: $pointerPath"

if ($Bootstrap) {
  Write-Host "[!] One-time bootstrap selected: differing managed target/global files will be adopted from this workspace after preflight." -ForegroundColor Yellow
}
if (-not (Test-ImmutablePointer)) {
  Show-PointerRepairGuide
  if ($DryRun) {
    exit 1
  }

  $clipboardReady = $false
  try {
    Set-Clipboard -Value $expectedPointer
    $clipboardReady = (Get-Clipboard -Raw) -eq $expectedPointer
    if ($clipboardReady) {
      Write-Host "[OK] Expected proxy statement copied to clipboard."
    } else {
      Write-Host "[!] Clipboard did not retain the expected statement." -ForegroundColor Yellow
    }
  } catch {
    Write-Host "[!] Clipboard is unavailable. The required statement is printed above; enter it manually in Notepad." -ForegroundColor Yellow
  }

  if ($clipboardReady) {
    Write-Host "[>] Notepad will open the proxy. Paste the copied statement, save, then close Notepad."
  } else {
    Write-Host "[>] Notepad will open the proxy. Replace its entire content with the statement printed above, save, then close Notepad."
  }
  Start-Process -FilePath "notepad.exe" -ArgumentList $pointerPath -Wait
  if (-not (Test-ImmutablePointer)) {
    throw "Proxy remains invalid. No deployment was attempted."
  }
}

Write-Section "Read-only deployment preflight"
Invoke-Sync -ReadOnly
if ($DryRun) {
  Write-Host "[OK] Dry-run preflight passed. No deployment was attempted."
  exit 0
}

Write-Section "Managed deployment and target verification"
Invoke-Sync

Write-Section "OMP restart required"
Write-Host "[OK] Deployment completed. Stop and start the OMP session now so it loads the deployed extension."
Write-Host "[!] P6 runtime proof still requires an isolated native scratch-session smoke and the typesafe-health runtime-origin record."
