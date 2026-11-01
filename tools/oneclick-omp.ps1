[CmdletBinding()]
param(
  [ValidateSet("Auto", "VerifyOnly", "ForceSync")]
  [string]$Mode = "Auto",
  [switch]$Live,
  [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$toolsDirectory = Split-Path -Parent $PSCommandPath
$workspaceDirectory = Split-Path -Parent $toolsDirectory
$verifyScript = Join-Path $toolsDirectory "verify-omp-global.cjs"
$promoteScript = Join-Path $toolsDirectory "promote-omp-global.ps1"

function Write-Banner([string]$title) {
  Write-Host ""
  Write-Host "==================================================================" -ForegroundColor Cyan
  Write-Host " $title" -ForegroundColor Cyan
  Write-Host "==================================================================" -ForegroundColor Cyan
}

$jsRuntime = if (Get-Command bun -ErrorAction SilentlyContinue) { "bun" } elseif (Get-Command node -ErrorAction SilentlyContinue) { "node" } else { throw "Bun or Node.js is required on PATH." }

$verifyArgs = @($verifyScript)
if ($Live) { $verifyArgs += "--live" }
if ($Json) { $verifyArgs += "--json" }

if ($Mode -eq "VerifyOnly") {
  & $jsRuntime @verifyArgs
  exit $LASTEXITCODE
}

Write-Banner "STEP 1: Inspecting Current OMP Global Sync & Health Status"
$jsonReport = & $jsRuntime $verifyScript --json
$checkExit = $LASTEXITCODE
$parsed = $jsonReport | ConvertFrom-Json

if ($Mode -eq "Auto" -and $checkExit -eq 0 -and $parsed.overallOk) {
  & $jsRuntime @verifyArgs
  $verifyExit = $LASTEXITCODE
  if ($verifyExit -ne 0) { exit $verifyExit }
  Write-Host ""
  Write-Host "[OK] Deployed files pass disk verification. Loaded runtime and native judge are not verified by this command." -ForegroundColor Green
  exit 0
}

Write-Banner "STEP 2: Promoting Workspace Changes to OMP Global Runtime"
& powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File $promoteScript
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Banner "STEP 3: Post-Deployment Verification & Checksum Proof"
& $jsRuntime @verifyArgs
exit $LASTEXITCODE
