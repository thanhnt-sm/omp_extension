# Data Flow & State Transition Specification

## 1. End-to-End Task Lifecycle Data Flow

The following sequence diagram details the full data flow when an agent requests task completion via `todo(op="done")`:

```mermaid
sequenceDiagram
    autonumber
    actor Agent as Coding Agent
    participant Interceptor as typesafe-planner.ts
    participant Collector as evidence-collector.ts
    participant Gate1 as Gate 1 (Deterministic)
    participant Upstream as TypeSafe System One (jev-latest)
    participant Remediation as XML Remediation Engine

    Agent->>Interceptor: todo(op: "done", task: "Feature X")
    Interceptor->>Collector: collectTaskEvidence({taskId, testCommand})
    
    Collector-->>Interceptor: Evidence { gitDiff, testExitCode, testOutput, criteria }
    
    Interceptor->>Gate1: checkDeterministicPreconditions(Evidence)
    
    alt Gate 1 Fails (Exit code != 0, deleted assertions, no diff)
        Gate1-->>Interceptor: Gate1Result (passed: false, reasons)
        Interceptor->>Remediation: generateFallbackRemediation(reasons)
        Remediation-->>Interceptor: <remediation> XML
        Interceptor-->>Agent: REJECT Task Completion + <remediation> XML
    else Gate 1 Passes
        Gate1-->>Interceptor: Gate1Result (passed: true)
        Interceptor->>Upstream: evaluateGate({ state: Evidence, questions: GateQuestions })
        Upstream-->>Interceptor: Answers { meets_criteria, claude_account_untouched }
        
        alt Gate 2 Score < 0.70 or Account Touched
            Interceptor->>Remediation: generateFallbackRemediation(failureReasons)
            Remediation-->>Interceptor: <remediation> XML
            Interceptor-->>Agent: REJECT Task Completion + <remediation> XML
        else Gate 2 Passes
            Interceptor-->>Agent: APPROVE Task Completion (Task Marked Done)
        end
    end
```

---

## 2. State Transition Lifecycle

The state of a task progresses through strict finite state machine boundaries:

```mermaid
stateDiagram-v2
    [*] --> PENDING: Initialized via Plan
    PENDING --> IN_PROGRESS: todo(op="start")
    
    IN_PROGRESS --> GATE_1_EVAL: todo(op="done")
    
    state GATE_1_EVAL {
        [*] --> CheckOSDiff
        CheckOSDiff --> CheckTestExitCode
        CheckTestExitCode --> CheckAssertionStripping
        CheckAssertionStripping --> [*]
    }

    GATE_1_EVAL --> REJECTED_REMEDIATION: Gate 1 Preconditions Failed
    GATE_1_EVAL --> GATE_2_EVAL: Gate 1 Passed (Local <150ms)

    state GATE_2_EVAL {
        [*] --> SendSystemOnePayload
        SendSystemOnePayload --> EvaluateMeetsCriteria
        EvaluateMeetsCriteria --> EvaluateIsolation
        EvaluateIsolation --> [*]
    }

    GATE_2_EVAL --> REJECTED_REMEDIATION: Probability < 0.70
    GATE_2_EVAL --> COMPLETED: Semantic & Deterministic Verification Approved

    REJECTED_REMEDIATION --> IN_PROGRESS: Agent receives <remediation> & fixes code
    COMPLETED --> [*]
```

---

## 3. Failure Ratchet & Circuit Breaker Logic

To prevent infinite hallucination loops:
1. Each task maintains a consecutive failure counter (`failureCount`).
2. If `failureCount >= 3`, the ratchet locks the task into `HARD_STOP`.
3. To recover, the human supervisor must either fix the root cause and provide `resetFailures: true` or manually set `TYPESAFE_ALLOW_MODIFICATION=1`.
