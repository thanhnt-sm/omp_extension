const fs = require("fs");
const path = require("path");

const target = path.resolve("./typesafe-planner.ts");
let content = fs.readFileSync(target, "utf8");

// Update evaluateDebate in createExtensionJudgeClient to default to jev-latest
content = content.replace(
  /async evaluateDebate\(params: \{[\s\S]*?model: "jev-fast";[\s\S]*?\}\) \{[\s\S]*?const res = await executeTypeSafe\([\s\S]*?model: "jev-fast",[\s\S]*?apiKey,[\s\S]*?signal,[\s\S]*?ctx[\s\S]*?\);[\s\S]*?modelUsed: "jev-fast",[\s\S]*?modelUsed: "jev-fast"[\s\S]*?modelUsed: "jev-fast"[\s\S]*?modelUsed: "jev-fast"[\s\S]*?\},/g,
  `async evaluateDebate(params: {
        state: string;
        questions: Record<string, TypeSafeQuestion>;
        model?: string;
      }) {
        const targetModel = params.model || process.env.TYPESAFE_PREDICT_MODEL || "jev-latest";
        const res = await executeTypeSafe(
          {
            state: params.state,
            questions: params.questions,
            model: targetModel,
          },
          apiKey,
          signal,
          ctx
        );

        if (res.details && typeof res.details === "object" && "answers" in res.details) {
          return {
            answers: res.details.answers as Record<string, { score: number; verdict?: string }>,
            modelUsed: targetModel,
          };
        }

        try {
          const text = res.content?.[0]?.text;
          if (text && text.startsWith("{")) {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === "object" && parsed.answers) {
              return { answers: parsed.answers, modelUsed: targetModel };
            }
          }
          return { error: text || "TypeSafe debate evaluation failed", modelUsed: targetModel };
        } catch {
          return { error: res.content?.[0]?.text || "TypeSafe debate evaluation failed", modelUsed: targetModel };
        }
      },`
);

// Update inline DebateJudgeClient interface in typesafe-planner.ts
content = content.replace(
  /export interface DebateJudgeClient \{[\s\S]*?model: "jev-fast";[\s\S]*?\};/g,
  `export interface DebateJudgeClient {
  evaluateDebate: (params: {
    state: string;
    questions: Record<string, TypeSafeQuestion>;
    model?: string;
  }) => Promise<{
    answers?: Record<string, { score: number; verdict?: string }>;
    modelUsed?: string;
    error?: string;
  }>;
}`
);

// Update inline runMultiPersonaDebate in typesafe-planner.ts
content = content.replace(/model: "jev-fast"/g, 'model: process.env.TYPESAFE_PREDICT_MODEL || "jev-latest"');
content = content.replace(/modelTier: "fast"/g, 'modelTier: "jev-latest"');

fs.writeFileSync(target, content, "utf8");
console.log("Updated typesafe-planner.ts to default to jev-latest");
