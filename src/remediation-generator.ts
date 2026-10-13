import type { RemediationDirective } from "./types/security";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateRemediationBlock(params: RemediationDirective): string {
  const dynamicActionItems = [...params.actionItems];
  const dynamicConstraints = [...params.immutableConstraints];

  // Synthesize dynamic action items based on failure reasons
  for (const reason of params.failureReasons) {
    if (reason.toLowerCase().includes("test suite failed") || reason.toLowerCase().includes("test failure")) {
      const fileMatch = reason.match(/([a-zA-Z0-9_-]+\.test\.ts)/i);
      if (fileMatch) {
        dynamicActionItems.push(`Run tests to verify fixes: bun test ${fileMatch[1]}`);
      } else {
        dynamicActionItems.push(`Run full test suite to verify fixes: bun test`);
      }
    }
    
    if (reason.toLowerCase().includes("test evasion") || reason.toLowerCase().includes("deleted assertion")) {
      dynamicActionItems.push("Restore deleted test assertions and ensure tests pass legitimately.");
      dynamicConstraints.push("Do not delete existing assertions or test blocks.");
    }
    
    if (reason.toLowerCase().includes("drift") || reason.toLowerCase().includes("scope creep")) {
      dynamicActionItems.push("Revert unapproved architectural changes and restrict modifications to planned boundaries.");
      dynamicConstraints.push("Strictly adhere to planned architecture and boundaries.");
    }
  }

  const uniqueConstraints = [...new Set(dynamicConstraints)];
  const uniqueActionItems = [...new Set(dynamicActionItems)];

  const constraintsXml = uniqueConstraints.map((c) => `    <constraint>${escapeXml(c)}</constraint>`).join("\n");
  const reasonsXml = params.failureReasons.map((r) => `    <reason>${escapeXml(r)}</reason>`).join("\n");
  const actionsXml = uniqueActionItems.map((a) => `    <action>${escapeXml(a)}</action>`).join("\n");
  const taskTag = params.taskId ? `  <task_id>${escapeXml(params.taskId)}</task_id>\n` : "";
  const criteriaTag =
    params.criteria && params.criteria.length > 0
      ? `  <target_criteria>\n${params.criteria.map((c) => `    <criterion>${escapeXml(c)}</criterion>`).join("\n")}\n  </target_criteria>\n`
      : "";

  return `<remediation>
  <instruction>${escapeXml(params.instruction)}</instruction>
${taskTag}${criteriaTag}  <immutable_constraints>
${constraintsXml}
  </immutable_constraints>
  <failure_reasons>
${reasonsXml}
  </failure_reasons>
  <action_items>
${actionsXml}
  </action_items>
</remediation>`;
}

export interface PlanDeltaParams {
  taskId?: string;
  reasons: string[];
  nextActions: string[];
  suggestedTasks?: string[];
  humanAuthorized?: boolean;
}

export function synthesizePlanDelta(
  params: PlanDeltaParams | { reasons: string[]; nextActions: string[] }
): string {
  const reasons = params.reasons || [];
  const nextActions = params.nextActions || [];
  const taskId = "taskId" in params ? params.taskId : undefined;
  const suggested = "suggestedTasks" in params && params.suggestedTasks ? params.suggestedTasks : [];

  const reasonsXml = reasons.map((r) => `    <reason>${escapeXml(r)}</reason>`).join("\n");
  const actionsXml = nextActions.map((a) => `    <action>${escapeXml(a)}</action>`).join("\n");
  const taskTag = taskId ? `  <task_id>${escapeXml(taskId)}</task_id>\n` : "";
  const suggestedTag = suggested.length > 0
    ? `  <proposed_plan_delta>\n${suggested.map((t) => `    <add_task>${escapeXml(t)}</add_task>`).join("\n")}\n  </proposed_plan_delta>\n`
    : "";

  return `<plan_reconciliation>
  <instruction>Deliverable verification identified missing requirements or next actions. Adapt your plan and todo list using the synthesized delta below rather than terminating.</instruction>
${taskTag}  <unfulfilled_criteria>
${reasonsXml}
  </unfulfilled_criteria>
  <required_actions>
${actionsXml}
  </required_actions>
${suggestedTag}</plan_reconciliation>`;
}
