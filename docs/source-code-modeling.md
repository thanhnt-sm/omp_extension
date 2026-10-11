# TypeSafe Extension for oh-my-pi (omp): Source Code Modeling & Architecture

## 1. C4 Architectural Model

### Level 1: System Context Diagram

```mermaid
graph TD
    User["👤 Human Operator / Developer"] -->|Executes tasks & commands| OMP["🖥️ oh-my-pi (omp) Agent Harness"]
    OMP -->|Drives autonomous coding loop| LLM["🤖 LLM Subagent (e.g. Gemini 3.8 Flash)"]
    OMP -->|Loads extension lifecycle| Extension["🛡️ TypeSafe Extension (typesafe-planner.ts)"]
    
    subgraph Local Workstation Environment
        Extension -->|Gathers OS ground truth| Git["📦 Git Repository & Test Runner (Bun)"]
        Extension -->|Enforces code & AST boundaries| FS["📂 Local Filesystem (Workspace & Plans)"]
    end

    subgraph Remote TypeSafe Cloud
        Extension -->|Dual Verification Gate (Gate 2)| SystemOne["☁️ TypeSafe System One API (jev-latest)"]
    end

    classDef core fill:#1e293b,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;
    classDef ext fill:#0f172a,stroke:#22c55e,stroke-width:2px,color:#f8fafc;
    classDef extSys fill:#1e1e24,stroke:#f59e0b,stroke-width:2px,color:#f8fafc;
    class OMP,LLM core;
    class Extension ext;
    class SystemOne,Git,FS extSys;
```

---

### Level 2: Container Diagram

```mermaid
graph LR
    subgraph OMP Runtime Process
        HookRegistry["Lifecycle Hook Registry"]
        ToolManager["Tool Registry"]
        MessageBus["IPC Message Bus (sendMessage)"]
    end

    subgraph TypeSafe Extension Bundle
        Entry["typesafe-planner.ts"]
        GateEng["Dual Verification Engine"]
        SafetyMod["Payload Safety & Redaction"]
        JudgeBridge["Expert Judge & Debate Bridge"]
    end

    subgraph External Boundaries
        APIGateway["https://api.typesafe.ai/v1/systemone"]
        ClaudeConfig["~/.claude (Prohibited Boundary)"]
    end

    HookRegistry -->|before_tool_call, session_start| Entry
    Entry --> GateEng
    Entry --> SafetyMod
    Entry --> JudgeBridge
    JudgeBridge -->|POST JSON with Bearer Token| APIGateway
    SafetyMod -.->|Blocks / Redacts access| ClaudeConfig

    classDef container fill:#1e293b,stroke:#64748b,stroke-width:1px,color:#f8fafc;
    class HookRegistry,ToolManager,MessageBus,Entry,GateEng,SafetyMod,JudgeBridge container;
```

---

### Level 3: Component Diagram (`src/` Architecture)

```mermaid
graph TB
    subgraph "Core Orchestration"
        TP["typesafe-planner.ts"]
    end

    subgraph "Verification Engine"
        VG["verification-gate.ts"]
        EC["evidence-collector.ts"]
        AA["ast-analyzer.ts"]
        RG["remediation-generator.ts"]
    end

    subgraph "Evaluation & Expert System"
        PE["plan-evaluator.ts"]
        CEJ["cook-expert-judge.ts"]
        DE["debate-evaluator.ts"]
    end

    subgraph "Security & Boundary Subsystem"
        PS["payload-safety.ts"]
        XE["xml-enclosure.ts"]
        AM["auth-manager.ts"]
        EGC["egc.ts"]
    end

    TP -->|Task completion intercept| VG
    TP -->|Pre-flight probe & auth| AM
    TP -->|Plan elevation tool| PE
    TP -->|Expert review tool| CEJ
    TP -->|Debate evaluation tool| DE

    VG -->|Collects diff, tests, criteria| EC
    VG -->|Deterministic AST checks| AA
    VG -->|Calls System One Gate 2| PS
    VG -->|Generates fallback instructions| RG

    PE -->|Plan safety & sanitize| PS
    PE -->|XML boundary defense| XE

    CEJ -->|Sanitize prompt state| PS
    CEJ -->|Wrap prompt blocks| XE

    DE -->|Multi-persona queries| PS
    RG -->|Formats XML tags| XE

    classDef comp fill:#0f172a,stroke:#38bdf8,stroke-width:1px,color:#f8fafc;
    class TP,VG,EC,AA,RG,PE,CEJ,DE,PS,XE,AM,EGC comp;
```

---

## 2. Component Dependency Graph

```
typesafe-planner.ts
 ├── src/plan-evaluator.ts
 │    ├── src/payload-safety.ts
 │    └── src/xml-enclosure.ts
 ├── src/verification-gate.ts
 │    ├── src/evidence-collector.ts
 │    ├── src/payload-safety.ts
 │    ├── src/ast-analyzer.ts
 │    │    └── src/types/security.ts
 │    ├── src/remediation-generator.ts
 │    │    └── src/types/security.ts
 │    └── src/auth-manager.ts
 │         └── src/types/security.ts
 ├── src/cook-expert-judge.ts
 │    ├── src/payload-safety.ts
 │    ├── src/xml-enclosure.ts
 │    └── src/verification-gate.ts
 ├── src/debate-evaluator.ts
 │    └── src/payload-safety.ts
 └── src/evidence-collector.ts
```

---

## 3. State Machine Models

### 3.1. Task Lifecycle & Dual Verification Gate State Machine

```mermaid
stateDiagram-v2
    [*] --> Uncontracted: Task conceived
    Uncontracted --> Contracted: todo init / append
    Contracted --> InProgress: todo start

    InProgress --> Ratchet_Check: Agent invokes "todo done"
    
    state Ratchet_Check {
        [*] --> IncrementCounter: failures = (failures || 0) + 1
        IncrementCounter --> CheckLimit: failures >= 3?
        CheckLimit --> Stalled_Halt: failures >= 3 (Halts loop & throws)
        CheckLimit --> ProceedToGate1: failures < 3
    }

    ProceedToGate1 --> Gate1_MicroCheck: Run cook-expert-judge.runTaskMicroCheck
    
    state Gate1_MicroCheck {
        [*] --> CheckClaudeBoundary
        CheckClaudeBoundary --> CheckTestExitCode: Clean (.claude untouched)
        CheckTestExitCode --> CheckASTEvasion: Tests Passed (code 0)
        CheckASTEvasion --> CheckCompletionProof: AST Safe (no deleted asserts)
        CheckCompletionProof --> [*]: Gate 1 Passed
    }

    Gate1_MicroCheck --> Rejected_Gate1: Violation detected
    Rejected_Gate1 --> InProgress: Plain text rejection message (counter remains incremented)

    Gate1_MicroCheck --> Gate2_MacroCheck: Gate 1 Passed

    state Gate2_MacroCheck {
        [*] --> RemoteSystemOneQuery: Send gitDiff + criteria to System One
        RemoteSystemOneQuery --> EvaluateThresholds: Answers received
        EvaluateThresholds --> [*]: P(meets_criteria) >= 0.80 & no_drift
    }

    Gate2_MacroCheck --> Rejected_Gate2: Score < 0.80 OR plan drift
    Rejected_Gate2 --> InProgress: Plain text rejection with drift reasons (counter remains incremented)

    Gate2_MacroCheck --> Verified: Gate 2 Approved
    Verified --> ClearRatchet: consecutiveFailuresByTask.delete(taskId)
    ClearRatchet --> [*]: Task marked completed
```

---

### 3.2. Session Lifecycle & Pre-Flight Health Probe

```mermaid
stateDiagram-v2
    [*] --> SessionStarting: session_start event
    SessionStarting --> IsolatedHealthProbe: fetch("https://api.typesafe.ai/v1/systemone")
    
    state IsolatedHealthProbe {
        [*] --> ExecuteFetch
        ExecuteFetch --> HTTP_200: Probe OK
        ExecuteFetch --> NetworkCatch: Timeout / Socket Error
        ExecuteFetch --> HTTP_401_403: Key Invalid
        ExecuteFetch --> HTTP_404: Endpoint Missing
    }

    NetworkCatch --> OfflineDegraded: Emit unreachable warning & continue
    HTTP_401_403 --> AuthRevoked: Mark AuthState revoked
    HTTP_404 --> SchemaMismatch: Emit endpoint failure
    HTTP_200 --> OnlineActive: Emit "TypeSafe: ONLINE (jev-latest)"

    OnlineActive --> InterceptionReady: Downstream IPC wrapped with .catch()
    OfflineDegraded --> InterceptionReady: Fail-closed fallback active
    AuthRevoked --> EscalatedToUser: Prompt user for valid key
    InterceptionReady --> [*]
```

---

### 3.3. Authentication Key Dynamic Recovery State Machine

```mermaid
stateDiagram-v2
    [*] --> Authenticated: New Token Provided

    Authenticated --> Authenticated: HTTP 200 OK (recordSuccess)
    Authenticated --> Refreshing: HTTP 401/403 (recordFailure, retryCount=1)
    
    Refreshing --> Authenticated: New Token Hash Detected
    Refreshing --> Revoked: Retry count >= MAX_RETRIES (1)
    
    Revoked --> Authenticated: User updates TYPESAFE_API_KEY
    Revoked --> Blocked: canAttempt() returns false
```

---

### 3.4. Stall Ratchet State Machine

```mermaid
stateDiagram-v2
    [*] --> ZeroFailures: Task Initialized (failures = 0)
    
    ZeroFailures --> OneFailure: 1st "todo done" attempt (counter = 1)
    OneFailure --> GatePassed: Gate 1 & 2 Approved (clears entry)
    GatePassed --> ZeroFailures

    OneFailure --> TwoFailures: 2nd "todo done" attempt (counter = 2)
    TwoFailures --> GatePassed: Gate 1 & 2 Approved (clears entry)

    TwoFailures --> RatchetTriggered: 3rd "todo done" attempt (counter = 3)
    RatchetTriggered --> OperatorEscalation: Halts autonomous execution immediately
    
    note right of RatchetTriggered
      Ratchet check occurs BEFORE Gate 1 runs.
      params.resetFailures deletes entry AFTER
      evaluating limit, so 3rd attempt still halts.
      ask approval does not clear this counter.
    end note
```

---

## 4. Domain & Data Contract Models

### 4.1. Gate Verification Entities

```mermaid
classDiagram
    class TaskEvidenceResult {
        +string gitStatus
        +string gitDiff
        +number testExitCode
        +string testOutput
        +string[] criteria
        +boolean cleanWorkingTree
        +boolean taskDoneProven
        +boolean todoCompleted
    }

    class Gate1Result {
        +boolean passed
        +string[] reasons
        +boolean cleanTree
        +boolean testPassed
        +boolean claudeSafe
    }

    class Gate2Result {
        +boolean passed
        +string[] reasons
        +number meetsCriteriaNoul
        +DriftChoice planDriftChoice
        +number claudeUntouchedNoul
        +boolean escalateToUser
    }

    class DualGateVerificationResult {
        +boolean approved
        +Gate1Result gate1
        +Gate2Result gate2
        +string[] reasons
        +string remediation
        +boolean escalateToUser
    }

    DualGateVerificationResult *-- Gate1Result
    DualGateVerificationResult *-- Gate2Result
    Gate1Result ..> TaskEvidenceResult : verifies
```
