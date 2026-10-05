#!/usr/bin/env node
/**
 * TypeSafe Baseline Backup & Sync Tool
 * 
 * Usage:
 *   node tools/sync-baseline.cjs
 * 
 * Workflow:
 * 1. Backs up C:\Users\thant\Projects\omp_extension into a timestamped directory.
 * 2. Copies the hardened, decoupled workspace baseline into C:\Users\thant\Projects\omp_extension.
 * 3. Verifies extension registration in C:\Users\thant\.omp\agent\extensions\typesafe-planner.ts.
 * 4. Runs test validation on the target directory to verify 100% test pass rate and stability with omp.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const TARGET_DIR = path.normalize("C:/Users/thant/Projects/omp_extension");
const WORKSPACE_DIR = path.resolve(__dirname, "..");
const EXTENSION_POINTER = path.normalize("C:/Users/thant/.omp/agent/extensions/typesafe-planner.ts");

console.log("=================================================================");
console.log("  TypeSafe Extension: Baseline Backup, Deploy & Verification     ");
console.log("=================================================================");
console.log(`Source Workspace : ${WORKSPACE_DIR}`);
console.log(`Target Directory : ${TARGET_DIR}`);
console.log(`OMP Extension    : ${EXTENSION_POINTER}`);
console.log("-----------------------------------------------------------------");

if (!fs.existsSync(TARGET_DIR)) {
  console.error(`[ERROR] Target directory not found: ${TARGET_DIR}`);
  process.exit(1);
}

// 1. Recursive copy helper
function copyDirRecursive(src, dest, ignore = ["node_modules", ".git"]) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (ignore.includes(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, ignore);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 2. Create Timestamped Backup
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const BACKUP_DIR = path.normalize(`C:/Users/thant/Projects/omp_extension_backup_${timestamp}`);

console.log(`\n[1/4] Creating backup of ${TARGET_DIR}...`);
try {
  copyDirRecursive(TARGET_DIR, BACKUP_DIR);
  console.log(` -> Backup created at: ${BACKUP_DIR}`);
} catch (err) {
  console.error("[ERROR] Failed to create backup:", err);
  process.exit(1);
}

// 3. Sync Baseline Files
console.log(`\n[2/4] Deploying workspace baseline files to target...`);
function getFilesRecursive(dir, baseRel = "") {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = baseRel ? `${baseRel}/${item.name}` : item.name;
    if (item.isDirectory()) {
      if (item.name !== "node_modules" && item.name !== ".git") {
        files.push(...getFilesRecursive(path.join(dir, item.name), rel));
      }
    } else {
      files.push(rel);
    }
  }
  return files;
}

const filesToDeploy = [
  "typesafe-planner.ts",
  "typesafe-planner.test.ts",
  "docs/typesafe-operations.md",
  "package.json",
  "tsconfig.json",
  ...getFilesRecursive(path.join(WORKSPACE_DIR, "src"), "src"),
  ...getFilesRecursive(path.join(WORKSPACE_DIR, "tests"), "tests"),
];

for (const relPath of filesToDeploy) {
  const src = path.join(WORKSPACE_DIR, relPath);
  const dest = path.join(TARGET_DIR, relPath);
  const destFolder = path.dirname(dest);
  if (!fs.existsSync(src)) continue;
  if (!fs.existsSync(destFolder)) {
    fs.mkdirSync(destFolder, { recursive: true });
  }
  fs.copyFileSync(src, dest);
  console.log(` -> Deployed: ${relPath}`);
}

// 4. Verify OMP Loader Pointer
console.log(`\n[3/4] Checking OMP loader pointer...`);
try {
  const expectedExport = `export { default } from "C:/Users/thant/Projects/omp_extension/typesafe-planner.ts";`;
  let currentContent = "";
  if (fs.existsSync(EXTENSION_POINTER)) {
    currentContent = fs.readFileSync(EXTENSION_POINTER, "utf8").trim();
  }
  if (!currentContent.includes("C:/Users/thant/Projects/omp_extension/typesafe-planner.ts")) {
    console.log(` -> Re-linking ${EXTENSION_POINTER}...`);
    fs.mkdirSync(path.dirname(EXTENSION_POINTER), { recursive: true });
    fs.writeFileSync(EXTENSION_POINTER, expectedExport + "\n", "utf8");
    console.log(" -> Pointer linked correctly.");
  } else {
    console.log(" -> OMP loader pointer is already aligned and valid.");
  }
} catch (err) {
  console.warn(`[WARNING] Could not check or update OMP pointer (${EXTENSION_POINTER}):`, err.message);
}

// 5. Run Verification Tests on Target
console.log(`\n[4/4] Verifying target directory with test suite...`);
try {
  const testOutput = execSync("bun test", { cwd: TARGET_DIR, encoding: "utf8" });
  const lines = testOutput.split("\n");
  const summaryLine = lines.find((l) => l.includes("pass") && l.includes("fail")) || "";
  console.log(` -> Test results in target: ${summaryLine.trim()}`);
  console.log("\n=================================================================");
  console.log("  SUCCESS: Baseline deployed and validated successfully!        ");
  console.log("=================================================================");
  console.log(`- Backup location : ${BACKUP_DIR}`);
  console.log(`- Active codebase : ${TARGET_DIR}`);
  console.log(`- Next step       : Restart OMP or reload extension to enjoy the update.`);
} catch (err) {
  console.error("[ERROR] Tests failed in target directory after deployment:");
  console.error(err.stdout || err.message);
  console.log(`\nRollback suggestion: Copy files back from ${BACKUP_DIR}`);
  process.exit(1);
}
