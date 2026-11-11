# TypeSafe lifecycle recovery

```json
{
  "schemaVersion": 1,
  "id": "6ef9388d-72df-41cb-89b0-efaaf6aca6f9",
  "operation": "block",
  "targets": [
    {
      "incarnationId": "[REDACTED:high-entropy]",
      "target": {
        "phase": "Phase 1",
        "phaseOrdinal": 0,
        "content": "Migrate staging schema",
        "ordinal": 0
      }
    }
  ],
  "reason": "Chờ khách hàng bàn giao production API key",
  "handoff": {
    "owner": "platform-team",
    "nextAction": "Provision credentials",
    "unblockCondition": "Credentials issued",
    "resumeCommand": "todo unblock task=\"Migrate staging schema\""
  },
  "completionClaimed": false,
  "debtReleased": false,
  "dependencyClaim": "reported, not independently verified",
  "humanConfirmed": true,
  "verifiedAutomaticDrop": false
}
```
