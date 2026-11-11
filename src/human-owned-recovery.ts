/** Minimal view of a host-recorded recovery plan; only the fields the ask gate needs. */
export interface RecoveryOwnerView { readonly kind?: string; readonly owner?: string }

/**
 * True only when exactly one native task is active and its recovery plan is human-owned (`kind` and `owner` both "human").
 * Pure and fail-closed: zero or several active tasks never consult `getRecovery`, and a throwing lookup returns false
 * so the technical-ask block stays in force.
 */
export function isSingleHumanOwnedRecovery<T>(activeTasks: readonly T[], getRecovery: (task: T) => RecoveryOwnerView | undefined): boolean {
  if (activeTasks.length !== 1) return false;
  try {
    const recovery = getRecovery(activeTasks[0]);
    return recovery?.kind === "human" && recovery.owner === "human";
  } catch {
    return false;
  }
}
