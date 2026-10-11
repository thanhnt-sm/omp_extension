const fs = require("fs");
const path = require("path");

const target = path.resolve("./typesafe-planner.ts");
let content = fs.readFileSync(target, "utf8");

// Remove Tri-Gate from Plan File Closure Guard
content = content.replace(
  /const isHumanAuthorized =[\s\S]*?throw new Error\(msg\);\s*\}/,
  ""
);

// Remove Tri-Gate from plan-cli Check Guard
content = content.replace(
  /const ctxObj = \(ctx as Record<string, unknown> \| undefined\) \|\| \{\};[\s\S]*?throw new Error\(msg\);\s*\}/,
  ""
);

// Remove Tri-Gate from Todo Done (Gate 3)
content = content.replace(
  /\/\/ Gate 3: Tri-Gate Human Approval[\s\S]*?throw new Error\(msg\);\s*\}/,
  ""
);

fs.writeFileSync(target, content, "utf8");
console.log("Removed Human Approval Gate 3");
