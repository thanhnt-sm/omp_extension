import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProjectExclusionPolicy } from "../src/project-exclusion-policy";

const resolver = require("../src/typesafe-enabled-resolver.cjs") as {
  resolveTypeSafeProjectExclusion(cwd: string, options: { homeDir: string }): { excluded: boolean; reason: string };
};

test("explicit exclusion works without credentials or Claude configuration and rejects malformed consent", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "omp-exclusion-"));
  const project = path.join(home, "project");
  const config = path.join(home, ".omp", "agent", "typesafe.json");
  try {
    fs.mkdirSync(project);
    fs.mkdirSync(path.dirname(config), { recursive: true });
    fs.writeFileSync(config, JSON.stringify({ typesafe: { projects: ["*"], excludeProjects: [project] } }));
    expect(resolver.resolveTypeSafeProjectExclusion(project, { homeDir: home })).toEqual({ excluded: true, reason: "global-excluded" });
    expect(fs.existsSync(path.join(home, ".claude"))).toBe(false);
    fs.writeFileSync(config, JSON.stringify({ typesafe: { projects: ["*"], excludeProjects: ["relative"] } }));
    expect(resolver.resolveTypeSafeProjectExclusion(project, { homeDir: home }).excluded).toBe(false);
    fs.writeFileSync(config, "{");
    expect(resolver.resolveTypeSafeProjectExclusion(project, { homeDir: home }).excluded).toBe(false);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test("session exclusion cannot be changed mid-session and children inherit only authenticated parent identity", () => {
  let configured = true;
  const excluded = createProjectExclusionPolicy({}, () => configured);
  const parent = { cwd: process.cwd(), agent: { kind: "main", id: "Main" }, sessionManager: { getSessionId: () => "parent", getSessionFile: () => path.resolve("parent.jsonl") } };
  expect(excluded(parent)).toBe(true);
  configured = false;
  expect(excluded(parent)).toBe(true);
  const child = { cwd: path.resolve("worktree"), agent: { kind: "sub", id: "Child", parentId: "Main" }, sessionManager: { getSessionId: () => "child", getHeader: () => ({ parentSession: path.resolve("parent.jsonl") }) } };
  expect(excluded(child)).toBe(true);
  expect(excluded({ ...child, sessionManager: { getSessionId: () => "foreign", getHeader: () => ({ parentSession: "foreign" }) } })).toBe(false);
  const governed = { ...parent, sessionManager: { getSessionId: () => "governed" } };
  expect(excluded(governed)).toBe(false);
  configured = true;
  expect(excluded(governed)).toBe(false);
});
