import { describe, expect, test } from "bun:test";
import registerExtension, {
  type DebateJudgeClient,
} from "../typesafe-planner";

describe("Phase 2 Client Integration: evaluateDebate on extension judge client", () => {
  test("createExtensionJudgeClient implements evaluateDebate method", async () => {
    let capturedTool: { name: string; execute: Function } | undefined;
    const mockPi = {
      zod: {
        object: (x: unknown) => x,
        union: (x: unknown) => x,
        string: () => ({ optional: () => "string", min: () => "string" }),
        number: () => ({ optional: () => "number" }),
        record: (x: unknown) => x,
        enum: (x: unknown) => x,
        unknown: () => ({ optional: () => "unknown" }),
        array: (x: unknown) => ({ min: () => x, optional: () => x }),
      },
      on: () => {},
      sendMessage: async () => {},
      registerTool: (def: { name: string; execute: Function }) => {
        if (def.name === "typesafe_elevate_plan") {
          capturedTool = def;
        }
      },
    };

    registerExtension(mockPi as unknown as Parameters<typeof registerExtension>[0]);
    expect(capturedTool).toBeDefined();

    // Verify typesafe_elevate_plan executes cleanly without missing evaluateDebate
    const res = await capturedTool!.execute("call-debate", {
      planTitle: "Secure Plan",
      planContent: "1. Step 1: Securely update auth in src/auth.ts\nVerification: bun test",
    });

    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.debate).toBeDefined();
    expect(parsed.debate.approved).toBe(true);
    expect(parsed.debate.modelTier).toBeDefined();
  });
});
