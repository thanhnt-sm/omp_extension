import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { captureWorkspaceSnapshot, collectTaskEvidence, type TaskEvidenceResult } from "../../src/evidence-collector";
import { digestBytes } from "../../src/evidence-workspace";
import type { CriterionPacketSelection } from "../../src/judge-evidence-packet";
import type { TaskContract } from "../../src/types/verification";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  return table;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
export type Rgb = readonly [number, number, number];
/** Smallest square that satisfies the System One floor (280 px per side, 78,400 px total); see phase-02 section 4. */
export const DEFAULT_IMAGE_SIDE = 280;
/** `size` is a square side; `width`/`height` override it per axis (used for out-of-range dimension cases). */
export interface PngSpec { size?: number; width?: number; height?: number; background?: Rgb; redSquare?: boolean; blueCircle?: boolean; padToBytes?: number }

/** A real, decodable RGB PNG (valid CRCs); optional shapes and a tEXt padding chunk to reach an exact byte size. */
export function buildPng(spec: PngSpec = {}): Buffer {
  const side = spec.size ?? DEFAULT_IMAGE_SIDE; const width = spec.width ?? side; const height = spec.height ?? side; const bg = spec.background ?? [255, 255, 255];
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3); // filter byte 0
    for (let x = 0; x < width; x++) {
      let px: Rgb = bg;
      if (spec.redSquare && x >= width * 0.25 && x < width * 0.75 && y >= height * 0.25 && y < height * 0.75) px = [220, 0, 0];
      if (spec.blueCircle && (x - width / 2) ** 2 + (y - height / 2) ** 2 <= (Math.min(width, height) * 0.3) ** 2) px = [0, 0, 220];
      row[1 + x * 3] = px[0]; row[2 + x * 3] = px[1]; row[3 + x * 3] = px[2];
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(Buffer.concat(rows)))];
  const iend = chunk("IEND", Buffer.alloc(0));
  const base = Buffer.concat([...parts, iend]);
  if (spec.padToBytes === undefined || spec.padToBytes <= base.length + 12 + 5) return base;
  const pad = chunk("tEXt", Buffer.concat([Buffer.from("pad\0", "ascii"), Buffer.alloc(spec.padToBytes - base.length - 12 - 4, 0x61)]));
  return Buffer.concat([...parts, pad, iend]);
}

const TINY_JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
const SOF_OFFSET = TINY_JPEG.indexOf(Buffer.from([0xff, 0xc2])); // SOF2 header: marker, length, precision, height(2), width(2)
/**
 * JPEG with COM padding segments inserted after SOI so the structure stays well-formed.
 * The SOF header declares `width`x`height` (the entropy data is the 1x1 sample, so this is structurally valid, not visually decodable).
 */
export function buildJpeg(padToBytes?: number, width: number = DEFAULT_IMAGE_SIDE, height: number = width): Buffer {
  const base = Buffer.from(TINY_JPEG);
  base.writeUInt16BE(height, SOF_OFFSET + 5); base.writeUInt16BE(width, SOF_OFFSET + 7);
  if (padToBytes === undefined || padToBytes <= base.length) return base;
  const segments: Buffer[] = []; let remaining = padToBytes - base.length;
  while (remaining > 4) {
    const payload = Math.min(remaining - 4, 65533);
    const seg = Buffer.alloc(4 + payload, 0x62); seg[0] = 0xff; seg[1] = 0xfe; seg.writeUInt16BE(payload + 2, 2);
    segments.push(seg); remaining -= seg.length;
  }
  return Buffer.concat([base.subarray(0, 2), ...segments, base.subarray(2)]);
}
/** Well-formed segments (SOI, JFIF APP0, COM, EOI) but no SOF marker: dimensions cannot be read. */
export function buildJpegWithoutSof(): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const com = Buffer.from([0xff, 0xfe, 0x00, 0x04, 0x68, 0x69]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, com, Buffer.from([0xff, 0xd9])]);
}

export interface UiRepo {
  cwd: string; contract: TaskContract; evidence: TaskEvidenceResult; tsxSha256: string; criterionId: string;
  /** Curated selection that carries the .tsx only: the image travels as an asset, never as packet source. */
  selection: CriterionPacketSelection; dispose(): Promise<void>;
}
export const TSX_SOURCE = "export const Button = () => <button>Click</button>;";
/** Real temp git repo: committed baseline, then a real .tsx change plus the given untracked binary files. */
export async function createUiRepo(binaries: Record<string, Buffer>): Promise<UiRepo> {
  // Isolated like tests/task-artifact-routing.test.ts: no user/system gitconfig, hooks, gpg signing, or credential prompts can slow or break the fixture.
  // `env` below covers only the fixture's own git calls; captureWorkspaceSnapshot/collectTaskEvidence are already isolated in production
  // (src/evidence-workspace.ts -> execFileChildSync("evidence-git") -> buildChildEnvironment: GIT_CONFIG_NOSYSTEM, GIT_CONFIG_GLOBAL=NUL, no HOME, hooksPath/fsmonitor off).
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "typesafe-visual-evidence-"));
  const cwd = path.join(root, "project"); const homeDir = path.join(root, "home");
  await fs.mkdir(cwd, { recursive: true }); await fs.mkdir(path.join(homeDir, "empty-hooks"), { recursive: true });
  const user = { sessionId: "session-1", entryId: "user-1", digest: "req-1", kind: "user_request" as const };
  const source = { path: "src/button.tsx", digest: "approved-source", startLine: 1, endLine: 10, text: TSX_SOURCE };
  const criterionId = "criterion-ui-visual";
  const contract: TaskContract = {
    schemaVersion: 1, contractId: "contract-ui-visual", revision: 1, revisionId: "rev-1", incarnationId: "inc-1",
    creation: { sessionId: "session-1", branchId: "branch-1", entryId: "entry-1", callId: "call-1" },
    target: { phase: "UI Phase", phaseOrdinal: 0, content: "Deliver Button Component", ordinal: 0 }, taskKind: "implementation",
    allowedMutationScope: { paths: ["src/**", "assets/**", "sessions/**"], operations: ["read", "create", "modify"] },
    approvedSource: { kind: "plan", path: "phase-02.md", digest: "approved-plan", approval: user, spans: [source] },
    originalUserRequest: user, amendments: [], criteria: [{ id: criterionId, kind: "acceptance", text: "Button renders as a visible labelled control.", source }],
    approvedCommandIds: [], parentRequirements: [], policyDigest: "a".repeat(64),
  };
  try {
    const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(homeDir, "absent-gitconfig"), GIT_TERMINAL_PROMPT: "0" };
    const git = (...args: string[]) => execFileSync("git", args, { cwd, env, stdio: "ignore", windowsHide: true });
    git("init", "-q"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.invalid");
    git("config", "core.autocrlf", "false"); git("config", "core.quotePath", "false"); git("config", "commit.gpgsign", "false");
    git("config", "core.hooksPath", path.join(homeDir, "empty-hooks"));
    await fs.writeFile(path.join(cwd, "seed.txt"), "baseline"); git("add", "."); git("commit", "-qm", "baseline");
    const baseline = await captureWorkspaceSnapshot(cwd, { contract });
    await fs.mkdir(path.join(cwd, "src"), { recursive: true });
    await fs.writeFile(path.join(cwd, "src", "button.tsx"), TSX_SOURCE);
    for (const [name, bytes] of Object.entries(binaries)) { await fs.mkdir(path.dirname(path.join(cwd, name)), { recursive: true }); await fs.writeFile(path.join(cwd, name), bytes); }
    const evidence = await collectTaskEvidence({ cwd, contract, baseline });
    const tsxSha256 = digestBytes(Buffer.from(TSX_SOURCE, "utf8"));
    return { cwd, contract, evidence, tsxSha256, criterionId, selection: { criterionIds: [criterionId], sources: [{ path: "src/button.tsx", fullFileDigest: tsxSha256 }] },
      async dispose() { await fs.rm(root, { recursive: true, force: true }); } };
  } catch (error) { await fs.rm(root, { recursive: true, force: true }); throw error; }
}
