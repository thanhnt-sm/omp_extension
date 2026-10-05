const fs = require("fs");
const path = require("path");

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const targetDir = "C:\\Users\\thant\\Projects\\omp_extension";
const workspaceDir = path.resolve(".");

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = `C:\\Users\\thant\\Projects\\omp_extension_backup_${timestamp}`;

console.log("=== TypeSafe Deploy & Backup Script ===");
console.log(`Source Workspace: ${workspaceDir}`);
console.log(`Target Directory: ${targetDir}`);
console.log(`Backup Directory: ${backupDir}`);

if (!fs.existsSync(targetDir)) {
  console.error(`Error: Target directory does not exist: ${targetDir}`);
  process.exit(1);
}

// 1. Create Backup
console.log("\n[1/3] Creating backup of target directory...");
try {
  copyDirRecursive(targetDir, backupDir);
  console.log(`Backup created successfully at: ${backupDir}`);
} catch (err) {
  console.error("Failed to create backup:", err);
  process.exit(1);
}

// 2. Deploy updated files
console.log("\n[2/3] Syncing files from workspace to target directory...");
const filesToSync = [
  "typesafe-planner.ts",
  "src/debate-evaluator.ts",
  "tests/debate-evaluator.test.ts",
  "tests/client-debate.test.ts",
  "tests/typesafe-planner.test.ts",
  "docs/typesafe-operations.md",
];

for (const relPath of filesToSync) {
  const srcFile = path.join(workspaceDir, relPath);
  const destFile = path.join(targetDir, relPath);
  const destDir = path.dirname(destFile);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  if (fs.existsSync(srcFile)) {
    fs.copyFileSync(srcFile, destFile);
    console.log(`Synced: ${relPath} -> ${destFile}`);
  } else {
    console.warn(`Warning: Source file not found: ${srcFile}`);
  }
}

console.log("\n[3/3] Deployment complete!");
console.log(`To restore if needed, copy files back from: ${backupDir}`);
