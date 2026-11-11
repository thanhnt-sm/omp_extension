import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { describe, expect, test } from "bun:test";
import { buildPng } from "./helpers/visual-evidence-fixture";

interface Outcome { ok: boolean; code?: string; answers?: Record<string, { noul?: number }>; metadata?: { resolvedModel?: string; bodyBytes?: number } }
const api = createRequire(import.meta.url)("../src/typesafe-api-client.cjs") as { judgeTypeSafe(options: Record<string, unknown>): Promise<Outcome> };

// Opt-in network proof (billable): OMP_LIVE_TYPESAFE_TESTS=1 plus TYPESAFE_API_KEY in the environment. The key is never logged.
const liveKey = process.env.OMP_LIVE_TYPESAFE_TESTS === "1" ? process.env.TYPESAFE_API_KEY?.trim() : undefined;

describe("live System One image effect (real extension HTTP path)", () => {
  test.skipIf(!liveKey)("a red-square PNG yields high 'red square' and low 'blue circle' probabilities", async () => {
    // System One rejects images under 280 px or 78,400 total pixels, and 400s an asset no text references.
    const png = buildPng({ size: 320, redSquare: true }); const ref = `live-image-${randomUUID()}`;
    let sentImageHeader: string | undefined;
    const spyFetch = (async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      sentImageHeader = Object.entries(headers).find(([name]) => name.toLowerCase() === "typesafe-danger-zone-images")?.[1];
      return globalThis.fetch(url, init);
    }) as unknown as typeof fetch;
    const outcome = await api.judgeTypeSafe({
      apiKey: liveKey, fetchImpl: spyFetch, purpose: "judge",
      args: {
        // The state deliberately says nothing about the picture: any correct answer must come from the pixels.
        state: { task: "Inspect the attached screenshot only." },
        questions: {
          contains_red_square: { type: "noul", instructions: `Does this image contain a red square: ${ref}?` },
          contains_blue_circle: { type: "noul", instructions: `Does this image contain a blue circle: ${ref}?` },
        },
        assets: { [ref]: { type: "image", format: "png", data_base64: png.toString("base64") } },
      },
    });
    const red = outcome.answers?.contains_red_square?.noul; const blue = outcome.answers?.contains_blue_circle?.noul;
    console.log(`LIVE_RESULT ok=${outcome.ok} code=${outcome.code ?? "-"} model=${outcome.metadata?.resolvedModel ?? "-"} red_square=${red} blue_circle=${blue} header=${sentImageHeader} png_bytes=${png.length}`);
    expect(outcome.ok, outcome.code).toBe(true);
    expect(sentImageHeader).toBe("true");
    expect(red).toBeGreaterThan(0.7);
    expect(blue).toBeLessThan(0.3);
  }, 120_000);
});
