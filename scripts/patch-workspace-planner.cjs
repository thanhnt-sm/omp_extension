const fs = require("fs");
const path = require("path");

const target = path.resolve("./typesafe-planner.ts");
let content = fs.readFileSync(target, "utf8");

// 1. Add import of debate evaluator if not present
if (!content.includes('from "./src/debate-evaluator"')) {
  content = content.replace(
    /import \{ preparePayloadSafe, isSecretInKey \} from "\.\/src\/payload-safety";/,
    'import { preparePayloadSafe, isSecretInKey } from "./src/payload-safety";\nimport {\n  constructMultiPersonaQuestions,\n  runMultiPersonaDebate,\n  type MultiPersonaDebateResult,\n  type DebateJudgeClient,\n} from "./src/debate-evaluator";'
  );
}

// 2. Add src/debate-evaluator.ts to PROTECTED_INTEGRITY_PATTERNS
if (!content.includes('"src/debate-evaluator.ts"')) {
  content = content.replace(
    /const PROTECTED_INTEGRITY_PATTERNS = \[/,
    'const PROTECTED_INTEGRITY_PATTERNS = [\n  "src/debate-evaluator.ts",'
  );
}

// 3. Implement evaluateDebate on createExtensionJudgeClient return object
if (!content.includes("async evaluateDebate(params: {")) {
  const evaluateDebateCode = `
      async evaluateDebate(params: {
        state: string;
        questions: Record<string, TypeSafeQuestion>;
        model: "jev-fast";
      }) {
        const res = await executeTypeSafe(
          {
            state: params.state,
            questions: params.questions,
            model: "jev-fast",
          },
          apiKey,
          signal,
          ctx
        );

        if (res.details && typeof res.details === "object" && "answers" in res.details) {
          return {
            answers: res.details.answers as Record<string, { score: number; verdict?: string }>,
            modelUsed: "jev-fast",
          };
        }

        try {
          const text = res.content?.[0]?.text;
          if (text && text.startsWith("{")) {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === "object" && parsed.answers) {
              return { answers: parsed.answers, modelUsed: "jev-fast" };
            }
          }
          return { error: text || "TypeSafe debate evaluation failed", modelUsed: "jev-fast" };
        } catch {
          return { error: res.content?.[0]?.text || "TypeSafe debate evaluation failed", modelUsed: "jev-fast" };
        }
      },
`;

  content = content.replace(
    /function createExtensionJudgeClient\([\s\S]*?return \{/,
    (match) => match + evaluateDebateCode
  );
}

// 4. Update executeTypeSafe to accept model override
if (!content.includes('const outgoing = { state: validParams.state, questions: validParams.questions, model: params.model || "jev-latest" };')) {
  content = content.replace(
    /const outgoing = \{ state: validParams\.state, questions: validParams\.questions, model: "jev-latest" \};/,
    'const outgoing = { state: validParams.state, questions: validParams.questions, model: params.model || "jev-latest" };'
  );
}

// 5. Update TypeSafeJudgeParams interface to support optional model
if (!content.includes("model?: string;")) {
  content = content.replace(
    /export interface TypeSafeJudgeParams \{[\s\S]*?questions: Record<string, TypeSafeQuestion>;/,
    (match) => match + "\n  model?: string;"
  );
}

// 6. Update todo tool parameter schema if registered or handled
if (content.includes("resetFailures: z.boolean().optional()")) {
  // already present
}

fs.writeFileSync(target, content, "utf8");
console.log("Successfully patched local typesafe-planner.ts in workspace");
