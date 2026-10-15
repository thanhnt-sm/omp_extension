import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const resolver = require("../src/typesafe-enabled-resolver.cjs") as {
  resolveTypeSafeEnabled(
    projectDir: string,
    options: { env: Record<string, string>; homeDir?: string }
  ): { enabled: boolean; reason: string };
};

function makeFixture(config: object): { homeDir: string; projectDir: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "typesafe-resolver-"));
  const homeDir = path.join(root, "home");
  const projectDir = path.join(root, "project");
  fs.mkdirSync(path.join(homeDir, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(projectDir, ".git"), { recursive: true });
  fs.writeFileSync(path.join(homeDir, ".claude", ".ck.json"), JSON.stringify(config));
  return { homeDir, projectDir, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

describe("bundled TypeSafe enabled resolver", () => {
  test("fails closed when the API key is absent", () => {
    const fixture = makeFixture({ typesafe: { projects: ["*"], excludeProjects: [] } });
    try {
      expect(resolver.resolveTypeSafeEnabled(fixture.projectDir, { env: {}, homeDir: fixture.homeDir })).toEqual({
        enabled: false,
        reason: "no-key",
      });
    } finally {
      fixture.cleanup();
    }
  });

  test("global kill switch wins over wildcard allowlisting", () => {
    const fixture = makeFixture({ typesafe: { enabled: false, projects: ["*"], excludeProjects: [] } });
    try {
      expect(resolver.resolveTypeSafeEnabled(fixture.projectDir, {
        env: { TYPESAFE_API_KEY: "fixture-key" },
        homeDir: fixture.homeDir,
      })).toEqual({ enabled: false, reason: "global-kill-switch" });
    } finally {
      fixture.cleanup();
    }
  });

  test("wildcard allowlists a unique git fixture unless an explicit exclusion wins", () => {
    const allowed = makeFixture({ typesafe: { projects: ["*"], excludeProjects: [] } });
    const excluded = makeFixture({ typesafe: { projects: ["*"], excludeProjects: [] } });
    try {
      expect(resolver.resolveTypeSafeEnabled(allowed.projectDir, {
        env: { TYPESAFE_API_KEY: "fixture-key" },
        homeDir: allowed.homeDir,
      })).toEqual({ enabled: true, reason: "global-allowlist" });

      fs.writeFileSync(path.join(excluded.homeDir, ".claude", ".ck.json"), JSON.stringify({
        typesafe: { projects: ["*"], excludeProjects: [excluded.projectDir] },
      }));
      expect(resolver.resolveTypeSafeEnabled(excluded.projectDir, {
        env: { TYPESAFE_API_KEY: "fixture-key" },
        homeDir: excluded.homeDir,
      })).toEqual({ enabled: false, reason: "global-excluded" });
    } finally {
      allowed.cleanup();
      excluded.cleanup();
    }
  });

  test("invalid exclusions fail closed", () => {
    const fixture = makeFixture({ typesafe: { projects: ["*"], excludeProjects: ["relative/path"] } });
    try {
      expect(resolver.resolveTypeSafeEnabled(fixture.projectDir, {
        env: { TYPESAFE_API_KEY: "fixture-key" },
        homeDir: fixture.homeDir,
      })).toEqual({ enabled: false, reason: "global-exclude-invalid" });
    } finally {
      fixture.cleanup();
    }
  });
});
