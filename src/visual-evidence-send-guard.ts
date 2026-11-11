import { digestBytes } from "./evidence-workspace";
import type { JudgeEvidencePacket, SystemOneImageAsset } from "./judge-evidence-packet";

/**
 * System One rejects images outside these limits with an opaque HTTP 400 and never resizes them
 * (observed live; see plans/261103-unified-judge-jev-standardization/phase-02-box-primitive-and-visual-evidence.md section 4).
 * The host checks locally so a wrong-sized screenshot becomes a specific EVIDENCE_REQUIRED reason instead of `http_400`.
 */
export const SYSTEM_ONE_IMAGE_LIMITS = { minSide: 280, maxSide: 1568, minPixels: 78_400, maxPixels: 2_458_624 } as const;

export interface ImageDimensions { width: number; height: number }
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Width/height straight from the header bytes (no decoder, no dependency); undefined when absent, truncated, malformed or zero. */
export function readImageDimensions(bytes: Uint8Array, format: "png" | "jpeg"): ImageDimensions | undefined {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found = format === "png" ? readPngDimensions(buf) : readJpegDimensions(buf);
  return found && found.width > 0 && found.height > 0 ? found : undefined;
}
/** IHDR must be the first chunk: signature(8) + length(4) + "IHDR"(4) + width(4 @16) + height(4 @20). */
function readPngDimensions(buf: Buffer): ImageDimensions | undefined {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE) || buf.toString("ascii", 12, 16) !== "IHDR") return undefined;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
/** Walks marker segments to the first SOF0-SOF15 (excluding DHT C4, JPG C8, DAC CC); stops at SOS/EOI, where no SOF can follow. */
function readJpegDimensions(buf: Buffer): ImageDimensions | undefined {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return undefined;
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return undefined;
    const marker = buf[i + 1];
    if (marker === 0xff) { i += 1; continue; } // fill byte
    if (marker === 0x00 || marker === 0xd9 || marker === 0xda) return undefined;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { i += 2; continue; } // standalone markers carry no length
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return i + 9 <= buf.length ? { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) } : undefined;
    }
    const length = buf.readUInt16BE(i + 2);
    if (length < 2) return undefined;
    i += 2 + length;
  }
  return undefined;
}

/** Reason code for an image the provider would reject, or undefined when the size is acceptable. Includes the observed size. */
export function imageDimensionReason(key: string, bytes: Uint8Array, format: "png" | "jpeg"): string | undefined {
  const size = readImageDimensions(bytes, format);
  if (!size) return `VISUAL_EVIDENCE_DIMENSIONS_UNREADABLE:${key}`;
  const { minSide, maxSide, minPixels, maxPixels } = SYSTEM_ONE_IMAGE_LIMITS;
  const pixels = size.width * size.height;
  if (Math.min(size.width, size.height) < minSide || Math.max(size.width, size.height) > maxSide || pixels < minPixels || pixels > maxPixels) {
    return `VISUAL_EVIDENCE_DIMENSIONS_OUT_OF_RANGE:${key}:${size.width}x${size.height}`;
  }
  return undefined;
}

export type VisualSendCheck =
  | { ok: true; assets?: Record<string, SystemOneImageAsset> }
  | { ok: false; reasons: string[] };

/**
 * Fail-closed gate between the in-memory image payload and the judge client.
 * The packet carries only metadata (key, format, bytes, sha256); the payload must reproduce it exactly.
 * On success the returned assets are a private copy, so later mutation cannot change what is sent.
 */
export function verifyVisualAssetsForSend(packet: Pick<JudgeEvidencePacket, "visualAssets">, payload: Readonly<Record<string, SystemOneImageAsset>> | undefined): VisualSendCheck {
  const metadata = packet.visualAssets ?? [];
  const keys = Object.keys(payload ?? {});
  if (!metadata.length && !keys.length) return { ok: true };
  const reasons: string[] = [];
  if (metadata.length !== keys.length || metadata.some((item) => !Object.hasOwn(payload ?? {}, item.key))) reasons.push("VISUAL_ASSET_SET_MISMATCH");
  else for (const item of metadata) {
    const asset = payload![item.key];
    const bytes = typeof asset?.data_base64 === "string" ? Buffer.from(asset.data_base64, "base64") : undefined;
    if (!asset || asset.type !== "image" || asset.format !== item.format) reasons.push(`VISUAL_ASSET_FORMAT_MISMATCH:${item.key}`);
    else if (!bytes || bytes.toString("base64") !== asset.data_base64 || bytes.length !== item.bytes) reasons.push(`VISUAL_ASSET_BYTES_MISMATCH:${item.key}`);
    else if (digestBytes(bytes) !== item.sha256) reasons.push(`VISUAL_ASSET_SHA256_MISMATCH:${item.key}`);
    else { const dimension = imageDimensionReason(item.key, bytes, item.format); if (dimension) reasons.push(dimension); }
  }
  return reasons.length ? { ok: false, reasons } : { ok: true, assets: structuredClone(payload as Record<string, SystemOneImageAsset>) };
}
