import { expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import * as reader from "../src/typesafe-evidence-file.cjs";
const helper = path.resolve(import.meta.dir, "../src/typesafe-evidence-file.cjs");
const confidential = "ordinary confidential prose belonging outside the authorized workspace";
function fixture() {
  const base = mkdtempSync(path.join(os.tmpdir(), "guarded-file-"));
  const root = path.join(base, "workspace"); const external = path.join(base, "external");
  mkdirSync(root); mkdirSync(external);
  writeFileSync(path.join(external, "private.txt"), confidential);
  return { base, root, external };
}
function rejection(root: string, relativePath: string, maxBytes = 1024): { code: string; kind: string; message: string } {
  try { reader.readWorkspaceFile(root, relativePath, { maxBytes }); throw new Error("Unsafe file was accepted"); }
  catch (error) {
    if (!(error instanceof Error) || !("code" in error) || !("kind" in error) || typeof error.code !== "string" || typeof error.kind !== "string") throw error;
    expect(error.message).not.toContain(confidential);
    return { code: error.code, kind: error.kind, message: error.message };
  }
}

test("authorized Unicode files produce the exact bounded buffer and digest, including empty files", () => {
  const f = fixture();
  try {
    const bytes = Buffer.from("legitimate \"quoted\" café 日本語\n"); const name = 'café 日本語 "quoted".txt';
    // Windows forbids literal quote characters; Unicode and spaces remain valid there.
    const filename = process.platform === "win32" ? "café 日本語 quoted.txt" : name;
    writeFileSync(path.join(f.root, filename), bytes);
    const image = reader.readWorkspaceFile(f.root, filename, { maxBytes: bytes.length });
    expect(image.bytes).toEqual(bytes);
    expect(image.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(Object.isFrozen(image.identity)).toBe(true);
    if (process.platform !== "win32") {
      // The caller's Git decoder owns quoted syntax; this boundary receives decoded names.
      const controlName = "quoted-tab\tline\n.txt";
      writeFileSync(path.join(f.root, controlName), bytes);
      expect(reader.readWorkspaceFile(f.root, controlName, { maxBytes: bytes.length }).bytes).toEqual(bytes);
    }
    writeFileSync(path.join(f.root, "empty"), "");
    expect(reader.readWorkspaceFile(f.root, "empty", { maxBytes: 0 }).bytes.length).toBe(0);
    expect(rejection(f.root, filename, bytes.length - 1).code).toBe("FILE_TOO_LARGE");
    expect(rejection(f.root, "missing").code).toBe("FILE_MISSING");
    expect(rejection(f.root, "missing").kind).toBe("unavailable");
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test("lexical traversal, drive-relative, UNC, device, ADS and protected paths never authorize external bytes", () => {
  const f = fixture();
  try {
    mkdirSync(path.join(f.root, ".claude")); writeFileSync(path.join(f.root, ".claude", "private"), confidential);
    for (const name of ["../external/private.txt", "..\\external\\private.txt", path.join(f.external, "private.txt"), "C:private.txt", "C:\\private.txt", "\\\\server\\share\\private", "\\\\?\\C:\\private", "allowed.txt:private", "file\0suffix", ".claude/private", ".CLAUDE/private", "NUL", "dir./private"]) {
      expect(rejection(f.root, name).kind).toBe("security");
    }
    mkdirSync(path.join(f.root, "directory"));
    expect(rejection(f.root, "directory").code).toBe("UNSAFE_FILE");
    writeFileSync(path.join(f.root, "not-directory"), "file");
    expect(rejection(f.root, "not-directory/private").kind).not.toBeUndefined();
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test("ancestor junctions and hardlink aliases are rejected", () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.root, "allowed"), "legitimate");
    symlinkSync(f.external, path.join(f.root, "linked-parent"), process.platform === "win32" ? "junction" : "dir");
    linkSync(path.join(f.external, "private.txt"), path.join(f.root, "hardlink"));
    for (const name of ["linked-parent/private.txt", "hardlink"]) expect(rejection(f.root, name).kind).toBe("security");
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test("junction root, junction intermediate parent and case-variant root behave safely", () => {
  const f = fixture();
  try {
    const dirLinkType = process.platform === "win32" ? "junction" : "dir";
    writeFileSync(path.join(f.root, "allowed.txt"), "legitimate");
    const junctionRoot = path.join(f.base, "junction-root");
    symlinkSync(f.root, junctionRoot, dirLinkType);
    const rootRejected = rejection(junctionRoot, "allowed.txt");
    expect(["UNSAFE_PARENT", "AMBIGUOUS_PARENT"]).toContain(rootRejected.code);

    mkdirSync(path.join(f.root, "real-sub"), { recursive: true });
    writeFileSync(path.join(f.root, "real-sub", "nested.txt"), "nested-safe");
    symlinkSync(path.join(f.root, "real-sub"), path.join(f.root, "intermediate-junction"), dirLinkType);
    const intermediateRejected = rejection(f.root, "intermediate-junction/nested.txt");
    expect(["UNSAFE_PARENT", "AMBIGUOUS_PARENT"]).toContain(intermediateRejected.code);

    if (process.platform === "win32") {
      const caseVariantRoot = path.join(f.base, "WorkSpace");
      const image = reader.readWorkspaceFile(caseVariantRoot, "allowed.txt", { maxBytes: 64 });
      expect(image.bytes.toString("utf8")).toBe("legitimate");
    }
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

for (const seam of ["before-open", "after-open", "after-read", "parent-after-read", "same-size-after-read", "overflow-after-open", "hardlink-after-read", "same-content-after-read"]) {
  test(`descriptor guard rejects deterministic ${seam} race without accepting forbidden content`, () => {
    const f = fixture();
    try {
      mkdirSync(path.join(f.root, "parent")); writeFileSync(path.join(f.root, "parent", "allowed"), "safe bytes");
      const script = `
        const fs=require('node:fs'),path=require('node:path');
        const root=${JSON.stringify(f.root)}, external=${JSON.stringify(f.external)}, seam=${JSON.stringify(seam)};
        const target=path.join(root,'parent','allowed');
        const originalOpen=fs.openSync,originalRead=fs.readSync; let changed=false;
        function mutate(){if(changed)return;changed=true;
          if(seam==='parent-after-read'){fs.renameSync(path.dirname(target),path.join(root,'original-parent'));fs.symlinkSync(external,path.dirname(target),process.platform==='win32'?'junction':'dir');}
          else if(seam==='same-size-after-read'){fs.writeFileSync(target,'evil bytes');fs.utimesSync(target,new Date(100000),new Date(200000));}
          else if(seam==='overflow-after-open'){fs.appendFileSync(target,'overflow');}
          else if(seam==='hardlink-after-read'){fs.linkSync(target,target+'.alias');}
          else if(seam==='same-content-after-read'){const bytes=fs.readFileSync(target);fs.renameSync(target,target+'.original');fs.writeFileSync(target,bytes);}
          else {fs.renameSync(target,target+'.original');fs.copyFileSync(path.join(external,'private.txt'),target);}
        }
        fs.openSync=function(file,...args){if(file===target&&seam==='before-open')mutate(); const fd=originalOpen.call(fs,file,...args);if(file===target&&(seam==='after-open'||seam==='overflow-after-open'))mutate();return fd;};
        fs.readSync=function(...args){const count=originalRead.apply(fs,args);if(['after-read','parent-after-read','same-size-after-read','hardlink-after-read','same-content-after-read'].includes(seam))mutate();return count;};
        try{require(${JSON.stringify(helper)}).readWorkspaceFile(root,'parent/allowed',{maxBytes:10});process.stdout.write(JSON.stringify({accepted:true}));}
        catch(error){process.stdout.write(JSON.stringify({accepted:false,code:error.code,message:error.message}));}
      `;
      const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      const observed: { accepted: boolean; code: string; message: string } = JSON.parse(result.stdout);
      expect(observed.accepted).toBe(false);
      expect(observed.code).toBeTruthy();
      expect(result.stdout).not.toContain(confidential);
    } finally { rmSync(f.base, { recursive: true, force: true }); }
  });
}

test("guarded listing authorizes empty roots and real nested files with explicit bounds", () => {
  const f = fixture();
  try {
    expect(reader.listWorkspaceFiles(f.root, "", { maxFiles: 10 })).toEqual([]);
    mkdirSync(path.join(f.root, "scoped"));
    writeFileSync(path.join(f.root, "scoped", "legitimate.txt"), "authorized");
    expect(reader.listWorkspaceFiles(f.root, "scoped", { maxFiles: 10 })).toEqual(["scoped/legitimate.txt"]);
    expect(reader.readWorkspaceFile(f.root, reader.listWorkspaceFiles(f.root, "scoped", { maxFiles: 10 })[0]!, { maxBytes: 10 }).bytes.toString()).toBe("authorized");
    expect(() => reader.listWorkspaceFiles(f.root, "", { maxFiles: 1 })).toThrow("DIRECTORY_LIMIT");
    symlinkSync(f.external, path.join(f.root, "linked"), process.platform === "win32" ? "junction" : "dir");
    expect(() => reader.listWorkspaceFiles(f.root, "", { maxFiles: 10 })).toThrow("UNSAFE_FILE");
    expect(() => reader.listWorkspaceFiles(f.root, "linked", { maxFiles: 10 })).toThrow("UNSAFE_PARENT");
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test("guarded listing rejects deterministic directory replacement before returning names", () => {
  const f = fixture();
  try {
    mkdirSync(path.join(f.root, "scoped")); writeFileSync(path.join(f.root, "scoped", "allowed"), "authorized");
    const script = `
      const fs=require('node:fs'),path=require('node:path'),root=${JSON.stringify(f.root)},external=${JSON.stringify(f.external)};
      const directory=path.join(root,'scoped'),original=fs.opendirSync;let changed=false;
      fs.opendirSync=function(file,...args){const result=original.call(fs,file,...args);if(file===directory&&!changed){changed=true;fs.renameSync(directory,directory+'.original');fs.symlinkSync(external,directory,process.platform==='win32'?'junction':'dir');}return result;};
      try{require(${JSON.stringify(helper)}).listWorkspaceFiles(root,'scoped',{maxFiles:10});process.stdout.write('accepted');}
      catch(error){process.stdout.write(error.code);}
    `;
    const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("DIRECTORY_IDENTITY_CHANGED");
    expect(result.stdout).not.toContain(confidential);
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

// Real capability probe: creating a file symlink needs developer mode/admin on Windows (EPERM otherwise).
function fileSymlinksAvailable(): boolean {
  const base = mkdtempSync(path.join(os.tmpdir(), "symlink-probe-"));
  try { writeFileSync(path.join(base, "target"), "x"); symlinkSync(path.join(base, "target"), path.join(base, "link"), "file"); return true; }
  catch (error) { if (error instanceof Error && "code" in error && (error.code === "EPERM" || error.code === "EACCES")) return false; throw error; }
  finally { rmSync(base, { recursive: true, force: true }); }
}
test.skipIf(!fileSymlinksAvailable())("external and internal final-file symlinks are rejected by the real OS boundary", () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.root, "allowed"), "legitimate");
    symlinkSync(path.join(f.external, "private.txt"), path.join(f.root, "external-link"), "file");
    symlinkSync(path.join(f.root, "allowed"), path.join(f.root, "internal-link"), "file");
    for (const name of ["external-link", "internal-link"]) expect(rejection(f.root, name).kind).toBe("security");
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

// Always-available reparse coverage where file symlinks are not creatable: a directory junction/symlink named as the final component.
test("final-component directory links to external and internal targets are rejected without exposing contents", () => {
  const f = fixture();
  try {
    mkdirSync(path.join(f.root, "inside")); writeFileSync(path.join(f.root, "inside", "allowed"), "legitimate");
    const kind = process.platform === "win32" ? "junction" : "dir";
    symlinkSync(f.external, path.join(f.root, "external-dir-link"), kind);
    symlinkSync(path.join(f.root, "inside"), path.join(f.root, "internal-dir-link"), kind);
    for (const name of ["external-dir-link", "internal-dir-link"]) expect(rejection(f.root, name).kind).toBe("security");
    for (const name of ["external-dir-link/private.txt", "internal-dir-link/allowed"]) expect(rejection(f.root, name).kind).toBe("security");
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test.skipIf(process.platform === "win32")("FIFO special files are rejected before a potentially blocking open", () => {
  const f = fixture();
  try {
    const result = spawnSync("mkfifo", [path.join(f.root, "fifo")], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(rejection(f.root, "fifo").code).toBe("UNSAFE_FILE");
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test("exclusive recovery publication returns a usable guarded Markdown report and exact SHA", () => {
  const f = fixture();
  try {
    const id = randomUUID(); const content = "# Public recovery\n\nRestore the unfinished public task, then run its verification.\n";
    const report = reader.writeRecoveryReport(f.root, { id, content });
    expect(report.path).toBe(`plans/reports/typesafe-recovery/${id}.md`);
    const accepted = reader.readWorkspaceFile(f.root, report.path, { maxBytes: 65536 });
    expect(accepted.bytes.toString("utf8")).toBe(content);
    expect(report.sha256).toBe(accepted.sha256);
    expect(report.sha256).toBe(createHash("sha256").update(content).digest("hex"));
    if (process.platform !== "win32") expect(statSync(path.join(f.root, report.path)).mode & 0o077).toBe(0);
    expect(() => reader.writeRecoveryReport(f.root, { id, content: "replacement must not be written" })).toThrow("REPORT_EXISTS");
    expect(readFileSync(path.join(f.root, report.path), "utf8")).toBe(content);
    const bounded = reader.writeRecoveryReport(f.root, { id: randomUUID(), content: "é".repeat(32768) });
    expect(reader.readWorkspaceFile(f.root, bounded.path, { maxBytes: 65536 }).bytes.length).toBe(65536);
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test("recovery publication rejects invalid IDs, oversized UTF-8, malformed text and accessors before mutation", () => {
  const f = fixture();
  try {
    for (const id of ["../outside", "C:outside", "not-a-uuid", "8FF3AC21-4BA4-4CA6-8A25-B543B79E1917"]) expect(() => reader.writeRecoveryReport(f.root, { id, content: "public" })).toThrow("INVALID_REPORT_ID");
    expect(() => reader.writeRecoveryReport(f.root, { id: randomUUID(), content: "é".repeat(32769) })).toThrow("REPORT_TOO_LARGE");
    expect(() => reader.writeRecoveryReport(f.root, { id: randomUUID(), content: "\ud800" })).toThrow("INVALID_REPORT_UTF8");
    let getterCalls = 0;
    expect(() => reader.writeRecoveryReport(f.root, { id: randomUUID(), get content() { getterCalls++; return "must not be evaluated"; } })).toThrow("INVALID_REPORT");
    expect(getterCalls).toBe(0);
    expect(readdirSync(f.root)).toEqual([]);
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

for (const depth of [0, 1, 2]) {
  test(`recovery publication rejects an ancestor junction at fixed component ${depth}`, () => {
    const f = fixture();
    try {
      const components = ["plans", "reports", "typesafe-recovery"];
      const parent = path.join(f.root, ...components.slice(0, depth));
      mkdirSync(parent, { recursive: true });
      symlinkSync(f.external, path.join(parent, components[depth]!), process.platform === "win32" ? "junction" : "dir");
      expect(() => reader.writeRecoveryReport(f.root, { id: randomUUID(), content: "public recovery" })).toThrow();
      expect(readdirSync(f.external)).toEqual(["private.txt"]);
      expect(readFileSync(path.join(f.external, "private.txt"), "utf8")).toBe(confidential);
    } finally { rmSync(f.base, { recursive: true, force: true }); }
  });
}

test("recovery publication preserves nonregular parents and existing hardlink aliases without truncation", () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.root, "plans"), "external parent bytes");
    expect(() => reader.writeRecoveryReport(f.root, { id: randomUUID(), content: "public" })).toThrow("UNSAFE_REPORT_DIRECTORY");
    expect(readFileSync(path.join(f.root, "plans"), "utf8")).toBe("external parent bytes");
    rmSync(path.join(f.root, "plans"));
    const directory = path.join(f.root, "plans", "reports", "typesafe-recovery");
    mkdirSync(directory, { recursive: true });
    const id = randomUUID(); const destination = path.join(directory, `${id}.md`);
    linkSync(path.join(f.external, "private.txt"), destination);
    expect(() => reader.writeRecoveryReport(f.root, { id, content: "public" })).toThrow("REPORT_EXISTS");
    expect(readFileSync(destination, "utf8")).toBe(confidential);
    expect(readFileSync(path.join(f.external, "private.txt"), "utf8")).toBe(confidential);
    const directoryId = randomUUID(); mkdirSync(path.join(directory, `${directoryId}.md`));
    expect(() => reader.writeRecoveryReport(f.root, { id: directoryId, content: "public" })).toThrow("REPORT_EXISTS");
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

for (const seam of ["mkdir-parent-swap", "after-open-replace", "after-close-replace", "after-fsync-rewrite", "after-fsync-hardlink", "after-read-replace"]) {
  test(`recovery publication fails closed on deterministic ${seam} interference`, () => {
    const f = fixture();
    try {
      const id = randomUUID(); const content = "# Public recovery\n\nUse the recorded public verification.\n";
      const relativePath = `plans/reports/typesafe-recovery/${id}.md`;
      const destination = path.join(f.root, relativePath);
      const script = `
        const fs=require('node:fs'),path=require('node:path'),root=${JSON.stringify(f.root)},external=${JSON.stringify(f.external)};
        const id=${JSON.stringify(id)},content=${JSON.stringify(content)},target=${JSON.stringify(destination)},seam=${JSON.stringify(seam)};
        const open=fs.openSync,close=fs.closeSync,sync=fs.fsyncSync,read=fs.readSync,mkdir=fs.mkdirSync;let writer,reader,changed=false;
        function mutate(){if(changed)return;changed=true;
          if(seam==='after-fsync-rewrite')fs.writeFileSync(target,${JSON.stringify(confidential)});
          else if(seam==='after-fsync-hardlink')fs.linkSync(target,target+'.alias');
          else {fs.renameSync(target,target+'.original');fs.writeFileSync(target,content);}
        }
        fs.mkdirSync=function(directory,...args){const result=mkdir.call(fs,directory,...args);if(seam==='mkdir-parent-swap'&&directory===path.join(root,'plans')&&!changed){changed=true;fs.renameSync(directory,directory+'.original');fs.symlinkSync(external,directory,process.platform==='win32'?'junction':'dir');}return result;};
        fs.openSync=function(file,flags,...args){const fd=open.call(fs,file,flags,...args);if(file===target){if((flags&fs.constants.O_CREAT)!==0){writer=fd;if(seam==='after-open-replace')mutate();}else reader=fd;}return fd;};
        fs.fsyncSync=function(fd){const result=sync.call(fs,fd);if(fd===writer&&(seam==='after-fsync-rewrite'||seam==='after-fsync-hardlink'))mutate();return result;};
        fs.closeSync=function(fd){const result=close.call(fs,fd);if(fd===writer&&seam==='after-close-replace')mutate();return result;};
        fs.readSync=function(fd,...args){const count=read.call(fs,fd,...args);if(fd===reader&&count>0&&seam==='after-read-replace')mutate();return count;};
        try{require(${JSON.stringify(helper)}).writeRecoveryReport(root,{id,content});process.stdout.write(JSON.stringify({accepted:true}));}
        catch(error){process.stdout.write(JSON.stringify({accepted:false,code:error.code,message:error.message}));}
      `;
      const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      const observed: { accepted: boolean; code: string; message: string } = JSON.parse(result.stdout);
      expect(observed.accepted).toBe(false);
      expect(observed.code).toBeTruthy();
      expect(result.stdout).not.toContain(confidential);
      expect(readdirSync(f.external)).toEqual(["private.txt"]);
      if (seam === "after-fsync-rewrite") expect(readFileSync(destination, "utf8")).toBe(confidential);
      if (seam.includes("replace")) expect(readFileSync(destination, "utf8")).toBe(content);
      if (seam === "mkdir-parent-swap") expect(existsSync(path.join(f.external, "reports"))).toBe(false);
    } finally { rmSync(f.base, { recursive: true, force: true }); }
  });
}
