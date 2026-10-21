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

$policyScript = Join-Path (Split-Path -Parent $toolsDirectory) "src\typesafe-child-env.cjs"
$nodeCommand = Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1
$nodeExecutable = [IO.Path]::GetFullPath($nodeCommand.Source)
if (-not [IO.Path]::IsPathRooted($nodeExecutable) -or -not (Test-Path -LiteralPath $policyScript -PathType Leaf)) {
  throw "A resolved Node executable and the shared child policy are required."
}

function New-ChildStartInfo([string]$executable, [string[]]$arguments) {
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $executable
  $info.UseShellExecute = $false
  $info.EnvironmentVariables.Clear()
  # Windows PowerShell's .NET lacks ArgumentList. Quote each argument by the CRT rules.
  $quoted = foreach ($argument in $arguments) {
    '"' + [regex]::Replace([regex]::Replace($argument, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1') + '"'
  }
  $info.Arguments = $quoted -join " "
  return $info
}

function Get-ChildPolicy([string]$purpose) {
  $info = New-ChildStartInfo $nodeExecutable @($policyScript, "--policy-json", $purpose)
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $process = New-Object Diagnostics.Process
  $process.StartInfo = $info
  try {
    if (-not $process.Start()) { throw "Policy bootstrap failed." }
    $text = $process.StandardOutput.ReadToEnd()
    $errorText = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0 -or $errorText -or $text.Length -gt 16384) { throw "Policy bootstrap rejected." }
    $policy = $text | ConvertFrom-Json
    $fields = @($policy.PSObject.Properties.Name | Sort-Object)
    $expectedFields = @("version", "purpose", "names", "required", "absolutePaths", "executableNames", "secretNames", "fixed", "maxValueBytes") | Sort-Object
    if (($fields -join ",") -ne ($expectedFields -join ",") -or $policy.version -ne 1 -or $policy.purpose -cne $purpose -or $policy.maxValueBytes -ne 32768) {
      throw "Invalid shared policy."
    }
    foreach ($name in @($policy.names) + @($policy.required) + @($policy.absolutePaths) + @($policy.executableNames) + @($policy.secretNames)) {
      if ($name -isnot [string] -or $name -cnotmatch '^[A-Za-z][A-Za-z0-9_]*$') { throw "Invalid policy name." }
    }
    if (@($policy.names | Group-Object { $_.ToUpperInvariant() } | Where-Object Count -gt 1).Count) { throw "Duplicate policy name." }
    foreach ($name in @($policy.required) + @($policy.absolutePaths) + @($policy.executableNames)) {
      if ($policy.names -cnotcontains $name) { throw "Invalid policy constraint." }
    }
    return $policy
  } finally { $process.Dispose() }
}

function Set-ChildPolicyEnvironment($info, [string]$purpose) {
  $policy = Get-ChildPolicy $purpose
  $source = New-Object 'Collections.Generic.Dictionary[string,string]' ([StringComparer]::OrdinalIgnoreCase)
  foreach ($entry in [Environment]::GetEnvironmentVariables().GetEnumerator()) {
    $name = [string]$entry.Key
    $value = [string]$entry.Value
    if ($source.ContainsKey($name) -and $source[$name] -cne $value) { throw "Child environment rejected: CASE_COLLISION" }
    $source[$name] = $value
  }
  $secrets = @()
  foreach ($name in $policy.secretNames) {
    if ($source.ContainsKey($name) -and $source[$name]) { $secrets += $source[$name]; if ($source[$name].Trim()) { $secrets += $source[$name].Trim() } }
  }
  foreach ($name in $policy.names) {
    if (-not $source.ContainsKey($name) -or -not $source[$name]) { continue }
    $value = $source[$name]
    if ($value.Contains([string][char]0) -or [Text.Encoding]::UTF8.GetByteCount($value) -gt $policy.maxValueBytes) { throw "Child environment rejected: UNSAFE_ALLOWED_VALUE" }
    foreach ($secret in $secrets) { if ($value.Contains($secret)) { throw "Child environment rejected: UNSAFE_ALLOWED_VALUE" } }
    if ($policy.absolutePaths -ccontains $name) {
      if ($value -notmatch '^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)' -or $value -match '[\r\n]') { throw "Child environment rejected: INVALID_DEPLOYMENT_PATH" }
    }
    if (($policy.executableNames -ccontains $name) -and $value -notmatch '^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+|[A-Za-z0-9_.-]+$)') { throw "Child environment rejected: INVALID_EXECUTABLE" }
    $info.EnvironmentVariables[$name] = $value
  }
  foreach ($name in $policy.required) { if (-not $info.EnvironmentVariables[$name]) { throw "Child environment rejected: MISSING_REQUIRED_OS_VALUE" } }
  foreach ($property in $policy.fixed.PSObject.Properties) {
    if ($property.Name -cnotmatch '^[A-Za-z][A-Za-z0-9_]*$' -or $property.Value -isnot [string]) { throw "Invalid fixed policy value." }
    foreach ($secret in $secrets) { if ($property.Value.Contains($secret)) { throw "Child environment rejected: UNSAFE_ALLOWED_VALUE" } }
    $info.EnvironmentVariables[$property.Name] = $property.Value
  }
}

function Invoke-PolicyChild([string]$purpose, [string]$executable, [string[]]$arguments) {
  $info = New-ChildStartInfo $executable $arguments
  Set-ChildPolicyEnvironment $info $purpose
  $process = New-Object Diagnostics.Process
  $process.StartInfo = $info
  try {
    if (-not $process.Start()) { throw "Child launch failed." }
    $process.WaitForExit()
    return $process.ExitCode
  } finally { $process.Dispose() }
}

function Invoke-Sync([switch]$ReadOnly) {
  $arguments = @($syncScript)
  if ($ReadOnly) {
    $arguments += "--dry-run"
  }
  if ($Bootstrap) {
    $arguments += "--bootstrap"
  }

  $exitCode = Invoke-PolicyChild "deployment-sync" $nodeExecutable $arguments
  if ($exitCode -ne 0) { exit $exitCode }
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
# Validate all forwarded values before displaying paths or considering the optional editor.
$validatedLaunch = New-ChildStartInfo $nodeExecutable @($syncScript)
Set-ChildPolicyEnvironment $validatedLaunch "deployment-sync"

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
  $editor = Join-Path ([Environment]::GetFolderPath("Windows")) "System32\notepad.exe"
  $editorExitCode = Invoke-PolicyChild "pointer-editor" $editor @($pointerPath)
  if ($editorExitCode -ne 0) { exit $editorExitCode }
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
