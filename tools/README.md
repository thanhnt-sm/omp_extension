# Baseline Deployment Tools

This directory contains utility scripts to back up and deploy the verified TypeSafe baseline from this workspace to the active OMP projects directory.

## Files

- **`sync-baseline.cjs`**: Managed deployment transaction. It is the only tool that writes the target/global allowlisted files.
- **`promote-omp-global.ps1`**: Guided Windows operator helper. It checks the immutable loader, opens Notepad if the operator must repair that external proxy, runs preflight, then runs the managed transaction.
- **`sync-baseline.bat`**: Double-click launcher for the guided helper.

## Run

Double-click:

```cmd
tools\sync-baseline.bat
```

Or run with an STA PowerShell process:

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\tools\promote-omp-global.ps1
```

The helper never writes the global OMP loader proxy. If that proxy is invalid, it opens the file and tries to copy the exact required one-line statement to the clipboard; the operator must paste, save, and close Notepad. If another process locks the clipboard, the statement remains printed in the helper for manual entry. It then runs a read-only preflight before any deployment write.

To validate without deploying:

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\tools\promote-omp-global.ps1 -DryRun
```

### One-time ownership bootstrap

Use bootstrap only when an operator explicitly adopts an existing unmanifested target/global baseline into this workspace. It snapshots every managed preimage, writes the manifest, verifies the target, and rejects any later bootstrap attempt once a manifest exists:

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\tools\promote-omp-global.ps1 -Bootstrap
```

After `DEPLOYED_VERIFIED`, restart OMP. A restarted isolated native scratch-session smoke remains the P6 runtime-proof requirement.
