const fs = require("fs");
const path = require("path");

const target = path.resolve("./typesafe-planner.ts");
let content = fs.readFileSync(target, "utf8");

// Change evaluateDebate model parameter in createExtensionJudgeClient to accept optional model and default to jev-latest
content = content.replace(
  'model: "jev-fast";\n      }) {\n        const res = await executeTypeSafe(\n          {\n            state: params.state,\n            questions: params.questions,\n            model: "jev-fast",\n          },',
  'model?: string;\n      }) {\n        const targetModel = params.model || process.env.TYPESAFE_PREDICT_MODEL || "jev-latest";\n        const res = await executeTypeSafe(\n          {\n            state: params.state,\n            questions: params.questions,\n            model: targetModel,\n          },'
);

content = content.replace(
  'modelUsed: "jev-fast",\n          };\n        }\n\n        try {\n          const text = res.content?.[0]?.text;\n          if (text && text.startsWith("{")) {\n            const parsed = JSON.parse(text);\n            if (parsed && typeof parsed === "object" && parsed.answers) {\n              return { answers: parsed.answers, modelUsed: "jev-fast" };\n            }\n          }\n          return { error: text || "TypeSafe debate evaluation failed", modelUsed: "jev-fast" };\n        } catch {\n          return { error: res.content?.[0]?.text || "TypeSafe debate evaluation failed", modelUsed: "jev-fast" };\n        }',
  'modelUsed: targetModel,\n          };\n        }\n\n        try {\n          const text = res.content?.[0]?.text;\n          if (text && text.startsWith("{")) {\n            const parsed = JSON.parse(text);\n            if (parsed && typeof parsed === "object" && parsed.answers) {\n              return { answers: parsed.answers, modelUsed: targetModel };\n            }\n          }\n          return { error: text || "TypeSafe debate evaluation failed", modelUsed: targetModel };\n        } catch {\n          return { error: res.content?.[0]?.text || "TypeSafe debate evaluation failed", modelUsed: targetModel };\n        }'
);

fs.writeFileSync(target, content, "utf8");
console.log("Safely updated evaluateDebate in typesafe-planner.ts");
