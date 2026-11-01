# Phần mở rộng TypeSafe cho oh-my-pi (omp): Mô hình hóa Mã nguồn & Kiến trúc (Source Code Modeling & Architecture)

Tài liệu này định nghĩa các mô hình kiến trúc đa tầng (Multi-Level Architectural Models) của `omp_extension` (`omp-typesafe-extension` v1.0.0) từ bối cảnh hệ thống từ trên xuống (C4 Cấp độ 1–4 / C4 Levels 1–4) đến đồ thị phụ thuộc mô-đun theo chiều ngang/chiều dọc (Horizontal/Vertical Dependency Graphs) và 6 máy trạng thái hình thức (Formal State Machines).

---

## 1. Mô hình Kiến trúc C4 (C4 Architectural Model)

### 1.1 Cấp độ 1: Sơ đồ Bối cảnh Hệ thống (Level 1: System Context Diagram)

Tại ranh giới bối cảnh hệ thống (System Context Boundary), `omp_extension` đóng vai trò trung gian điều phối giữa người vận hành/lập trình viên (Human Developer), bộ khung tác tử lập trình **oh-my-pi (OMP)**, mô hình ngôn ngữ lớn lập trình chính (Primary Coding LLM), tác tử con **Cố vấn Độc lập Chỉ Đọc (Independent Read-Only Native Advisor Subagent)**, môi trường Hệ điều hành/Git/Kiểm thử cục bộ, 3 gốc triển khai được quản lý (3 Managed Deployment Roots), và dịch vụ đám mây từ xa **TypeSafe System One API** (`jev-latest`).

```mermaid
flowchart TD
    Operator["Người vận hành / Lập trình viên (Human Operator / Developer)\n(Phê duyệt ui.confirm, chạy oneclick-omp)"]
    OMP["Bộ khung Tác tử oh-my-pi (omp Agent Harness)\n(Session Manager, Tool Registry, Subagent Host)"]
    PrimaryLLM["Tác tử Lập trình Chính (Primary Coding Agent)\n(Thực thi nhiệm vụ, ràng buộc hợp đồng, thu thập bằng chứng)"]
    AdvisorLLM["Tác tử con Cố vấn Gốc Độc lập (Independent Native Advisor Subagent)\n(Phiên con chỉ đọc / Read-only child session: read/grep/glob/yield)"]
    Ext["Phần mở rộng TypeSafe (TypeSafe Extension)\n(typesafe-planner.ts + 100 mô-đun src/)"]

    subgraph LocalOS["Máy trạm Cục bộ & Các Gốc Triển khai (Local Workstation & Deployment Roots)"]
        GitTest["Kho Git & Bộ chạy Kiểm thử Cô lập (Git Repo & Isolated Test Runner)\n(captureWorkspaceSnapshot, createVerificationHome)"]
        Roots["2 Gốc Triển khai Được Quản lý (2 Managed Deployment Roots)\n(target, global_omp_agents)"]
        Proxy["Trình trung chuyển Nạp Bất biến (Immutable Loader Proxy)\n(~/.omp/agent/extensions/typesafe-planner.ts)"]
    end

    subgraph Cloud["Đám mây TypeSafe Từ xa (Remote TypeSafe Cloud)"]
        SystemOne["☁️ Dịch vụ TypeSafe System One API\n(POST /v1/systemone — jev-latest)"]
    end

    Operator -->|"Lời nhắc (Prompts), /ck:cook, ui.confirm"| OMP
    Operator -->|"Chạy oneclick-omp / sync-baseline"| Roots
    Proxy -->|"Tái xuất ESM 1 dòng (1-line ESM re-export)"| Roots
    OMP -->|"Nạp phần mở rộng & phát 12 điểm móc (12 hooks)"| Ext
    PrimaryLLM <-->|"Gọi 16 công cụ typesafe_* + 5 công cụ gốc được bọc"| Ext
    Ext -->|"Khởi tạo nhiệm vụ đánh giá chỉ đọc có trung gian"| AdvisorLLM
    Ext -->|"Chụp nhanh tệp, chạy bun test đã phê duyệt"| GitTest
    Ext -->|"JSON đã che giấu <= 32 KiB (Bearer TYPESAFE_API_KEY)"| SystemOne

    classDef actor fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;
    classDef core fill:#1e293b,stroke:#22c55e,stroke-width:2px,color:#f8fafc;
    classDef infra fill:#1e1e24,stroke:#f59e0b,stroke-width:2px,color:#f8fafc;
    class Operator,OMP,PrimaryLLM,AdvisorLLM actor;
    class Ext core;
    class GitTest,Roots,Proxy,SystemOne infra;
```

---

### 1.2 Cấp độ 2: Sơ đồ Thùng chứa (Level 2: Container Diagram)

Bên trong tiến trình thời gian chạy (Runtime Process) và chuỗi công cụ vận hành (Operational Toolchain), `omp_extension` được tổ chức thành **4 thùng chứa thực thi (Execution Containers)**:
1. **Máy chủ Phần mở rộng Nội tiến trình OMP (OMP In-Process Extension Host — `typesafe-planner.ts`)**: Chặn bắt các điểm móc vòng đời (Lifecycle Hooks), bọc các công cụ gốc (`task`, `read`, `grep`, `glob`, `todo`), và cung cấp 16 công cụ `typesafe_*`.
2. **9 Miền Hệ thống con TypeScript/CJS Lõi (9 Core Subsystem Domains — `src/**`)**: Triển khai hợp đồng, ảnh chụp nhanh, gói bằng chứng 32 KiB, Đồng thuận Lưỡng viện (`M` + Advisor), thẩm phán chạy ngầm `H` (Shadow `H` Judge), và EGC.
3. **Thời gian chạy CJS Không phụ thuộc Dùng chung (Shared Zero-Dependency CJS Runtime — `src/typesafe-*.cjs`)**: Được đồng triển khai vào `target` và `~/.claude/` để phân giải bật/tắt (Opt-In Resolution), che giấu bí mật (Redaction), lưới chính sách (Policy Lattices), cô lập môi trường tiến trình con (Child Env Isolation), và đọc/ghi tệp chống TOCTOU.
4. **Giao diện CLI Vận hành & Đánh giá Bắt cặp (Operational & Paired Evaluation CLI — `tools/**`)**: Đồng bộ giao dịch ngoài băng tần (`sync-baseline.cjs`), bộ xác minh toàn cục 6 lớp (`verify-omp-global.cjs`), trình bọc một chạm (`oneclick-omp.ps1`), và đánh giá bắt cặp `M`/`H` (`jev-paired-eval.ts`).

```mermaid
graph TB
    subgraph OMPProcess["Tiến trình OMP (OMP Process - Bun / Node >= 18)"]
        SessionMgr["Quản lý Phiên (SessionManager)\n(getBranch, appendEntry)"]
        Entry["typesafe-planner.ts\n(16 Công cụ / Tools, 5 Trình bọc Gốc / Native Wrappers, 12 Điểm móc / Hooks)"]
        D2_D8["Các Thùng chứa Miền TypeScript (TypeScript Domain Containers D2–D9)\n(Contracts, Evidence, Verification, Advisor, Atomic, EGC, Security)"]
        D1_CJS["Thùng chứa Thời gian chạy CJS Dùng chung (Shared CJS Runtime Container D1)\n(Resolver, API Client, Redactor, Policy, ChildEnv, EvidenceFile)"]
    end

    subgraph ChildProcesses["Các Tiến trình Con Cô lập (Isolated Child Subprocesses)"]
        VerifyHome["createVerificationHome() (0o700)\n(bun test, git diff --no-index)"]
        EgcWorktree["Cây làm việc Git Tách rời EGC (EGC Detached Git Worktree)\n(Các lệnh verify + holdout)"]
        AdvisorChild["Phiên Tác tử con Advisor Có Trung gian (Mediated Advisor Subagent Session)\n(projectAdvisorPayload, executeAdvisorRead)"]
    end

    subgraph OutOfBandTools["Thùng chứa CLI Vận hành & Đánh giá (Operational & Evaluation CLI Container - tools/)"]
        OneClick["oneclick-omp.ps1 / verify-omp-global.cjs"]
        SyncTool["sync-baseline.cjs / promote-omp-global.ps1"]
        PairedCLI["jev-paired-eval.ts (17 mô-đun / 17 modules)"]
    end

    SessionMgr <-->|"Đọc/Ghi nối tiếp các mục omp.typesafe.*"| Entry
    Entry --> D2_D8
    D2_D8 --> D1_CJS
    D2_D8 -->|"spawnChild / execFileChildSync"| VerifyHome
    D2_D8 -->|"executeHostTask"| AdvisorChild
    D2_D8 -->|"runEgcCommand"| EgcWorktree
    OneClick --> SyncTool
    SyncTool -->|"Sử dụng buildChildEnvironment & createVerificationHome"| D1_CJS
    PairedCLI <-->|"Yêu cầu/Phản hồi ký số Ed25519 qua typesafe_eval_host"| Entry
```

---

### 1.3 Cấp độ 3: Sơ đồ Thành phần — 9 Miền Hệ thống con trong `src/` (Level 3: Component Diagram)

```mermaid
graph TB
    TP["typesafe-planner.ts\n(Điểm nhập Phần mở rộng Gốc / Root Extension Entrypoint)"]

    subgraph D2["D2: Lịch sử Máy chủ & Thời gian chạy Hợp đồng (Host History & Contract Runtime - 18 tệp)"]
        HH["host-history.ts\nhost-tool-invocation.ts"]
        CR["contract-runtime.ts\ntask-contract*.ts"]
        TLA["todo-lifecycle-authority.ts\ntask-recovery.ts"]
    end

    subgraph D3["D3: Ảnh chụp, Bằng chứng & Gói dữ liệu (Snapshot, Evidence & Packet Runtime - 8 tệp)"]
        TER["task-evidence-runtime.ts"]
        EW["evidence-workspace.ts\nevidence-collector.ts"]
        EA["evidence-artifacts.ts\nevidence-selection.ts\nevidence-privacy.ts"]
        VR["verification-receipt.ts"]
        JEP["judge-evidence-packet.ts"]
    end

    subgraph D4["D4: Xác thực Nhiệm vụ & Đồng thuận Lưỡng viện (Task Verification & Bicameral Consensus - 18 tệp)"]
        TVR["task-verification-runtime.ts\ntask-verification-macro.ts\ntask-verification-native.ts"]
        TVH["task-verification-history.ts\ntask-verification-historical.ts\ntask-verification-debt.ts"]
        BC["bicameral-consensus.ts"]
        VG["verification-gate.ts\ncook-expert-judge.ts"]
        PE["plan-evaluator.ts\ndebate-evaluator.ts\nplan-closure.ts"]
    end

    subgraph D5["D5: Cố vấn Gốc Độc lập (Independent Native Advisor - 20 tệp)"]
        AH["advisor-host.ts\nadvisor-host-dispatch.ts\nadvisor-host-hooks.ts"]
        AR["advisor-runtime.ts\nadvisor-protocol.ts\nadvisor-public-context.ts"]
        ARO["advisor-readonly.ts\nadvisor-guards.ts\nadvisor-native-budget.ts"]
        AHS["advisor-host-settlement.ts\nadvisor-host-history.ts\nadvisor-mutation-delegation.ts"]
    end

    subgraph D6["D6: Thẩm phán Nguyên tử (H) & Máy chủ Đánh giá (Atomic Judge & Eval Host - 10 tệp)"]
        AJ["atomic-judge.ts\natomic-preparation.ts\natomic-parent.ts"]
        AE["atomic-evaluation.ts\natomic-decision-policy.ts\natomic-checks.ts"]
        EH["evaluation-host.ts\nevaluation-host-corpus.ts\nevaluation-host-observation.ts"]
    end

    subgraph D7["D7: Hoàn thành Mục tiêu Thực chất — EGC (Earned Goal Completion - 4 tệp)"]
        EGC["egc.ts\negc-native.ts\negc-safety.ts\negc-judge.ts"]
    end

    subgraph D8["D8: Bảo mật, Biến đổi & Trình khách Ngữ nghĩa (Security, Mutation & Semantic Client - 9 tệp)"]
        SMA["source-mutation-authority.ts\nfile-mutation-targets.ts"]
        PS["payload-safety.ts\nast-analyzer.ts\nremediation-generator.ts"]
        SJC["semantic-judge-client.ts\nsemantic-approval-policy.ts\nauth-manager.ts\nxml-enclosure.ts"]
    end

    subgraph D1["D1: Thời gian chạy CJS & Ranh giới Hệ điều hành (CJS Runtime & OS Boundary - 9 tệp)"]
        CJS["typesafe-enabled-resolver.cjs\ntypesafe-api-client.cjs\ntypesafe-redact.cjs\ntypesafe-redact-patterns.cjs\ntypesafe-policy-client.cjs\ntypesafe-child-env.cjs\ntypesafe-evidence-file.cjs"]
    end

    subgraph D9["D9: Kiểu Dùng chung & Lỗi (Shared Types & Errors - 3 tệp)"]
        TYPES["types/verification.ts\ntypes/security.ts\nerrors/TypeSafeError.ts"]
    end

    TP --> D2 & D3 & D4 & D5 & D6 & D8
    D2 --> HH & CR & TLA
    D3 --> D2 & D1 & D8
    D4 --> D2 & D3 & D5 & D8
    D5 --> D1 & D2 & D3 & D8
    D6 --> D1 & D2 & D3 & D4 & D5
    D7 --> D1
    D8 --> D1 & D9
```

---

### 1.4 Cấp độ 4: Các Thực thể Dữ liệu Cốt lõi & Lược đồ Nhật ký Nhánh Phiên (Level 4: Core Data Entities & Session Branch Journal Schema)

Sơ đồ lớp (Class Diagram) dưới đây mô hình hóa 6 cấu trúc dữ liệu thời gian chạy chính (`TaskContract`, `WorkspaceSnapshot`, `JudgeEvidencePacket`, `AdvisorReceipt`, `TaskReviewOutcome`, `SyncManifest`) và 7 lược đồ mục nhánh phiên tùy chỉnh (`omp.typesafe.*`) được lưu trữ bền vững trong `ctx.sessionManager.getBranch()`.

```mermaid
classDiagram
    class TaskContract {
        +number schemaVersion
        +string contractId
        +string revisionId
        +string incarnationId
        +HostReference originalUserRequest
        +NativeTaskTarget nativeTarget
        +TaskKind taskKind
        +ContractCriterion[] criteria
        +ParentRequirement[] parentRequirements
        +MutationScope allowedMutationScope
        +string[] approvedCommandIds
        +string policyDigest
    }

    class WorkspaceSnapshot {
        +string snapshotId
        +string treeDigest
        +string mode
        +string headSha
        +string indexDigest
        +WorkspaceFileIdentity rootIdentity
        +Map~string,string~ files
        +Map~string,WorkspaceFileIdentity~ identities
    }

    class JudgeEvidencePacket {
        +string packetId
        +string packetDigest
        +string contractId
        +string contractRevisionId
        +string evaluatedTreeDigest
        +string verificationReceiptDigest
        +SelectedCriterionEvidence[] criteria
        +SelectedSourceSpan[] sources
        +SelectedArtifact[] deliverableArtifacts
        +PacketOmission[] omissions
        +number byteLength
    }

    class AdvisorReceipt {
        +string receiptId
        +string requestId
        +string requestDigest
        +string contractId
        +string contractRevisionId
        +string evaluatedTreeDigest
        +AdvisorPurpose purpose
        +AdvisorAuthority authority
        +boolean applicable
        +AdvisorAssessment assessment
        +AdvisorNativeObservation observation
    }

    class TaskReviewOutcome {
        +VerificationStatus status
        +string receiptId
        +string bindingDigest
        +string progressDigest
        +string[] missingCriterionIds
        +string[] reasons
        +string[] nextActions
        +TaskRecoveryPlan recovery
    }

    class SyncManifest {
        +number schemaVersion
        +string generatedAt
        +string workspaceDir
        +string targetDir
        +SyncManifestEntry[] entries
    }

    class BranchJournalEntries {
        <<Custom Session Branch Entries>>
        +omp.typesafe.tool-execution.v1
        +omp.typesafe.contract.source.v1
        +omp.typesafe.contract.confirmation.v1
        +omp.typesafe.contract.v1
        +omp.typesafe.task-verification-facts.v1
        +omp.typesafe.lifecycle-recovery.v1
        +typesafe:advisor:host:v1
    }

    TaskContract "1" --> "1..*" JudgeEvidencePacket : ràng buộc tiêu chí và phạm vi
    WorkspaceSnapshot "2" --> "1" JudgeEvidencePacket : đường cơ sở và cây được đánh giá
    JudgeEvidencePacket "1" --> "1" AdvisorReceipt : được đánh giá bởi Thùy 1 - Lobe 1
    JudgeEvidencePacket "1" --> "1" TaskReviewOutcome : được chấm bởi Thùy 2 - Lobe 2 M
    AdvisorReceipt "0..1" --> "1" TaskReviewOutcome : kết hợp qua arbitrateConsensus
    BranchJournalEntries ..> TaskContract : chiếu và lưu trữ bền vững
    BranchJournalEntries ..> AdvisorReceipt : xác minh hoàn tất
    BranchJournalEntries ..> TaskReviewOutcome : ghi nhận dữ kiện và cam kết
```

---

## 2. Đồ thị Phụ thuộc theo Chiều dọc & Chiều ngang (Vertical & Horizontal Dependency Graphs)

### 2.1 Phân cấp Lời gọi theo Chiều dọc — Thẩm quyền Điều khiển & Dữ liệu Từ trên xuống (Vertical Call Hierarchy)

Phân cấp chiều dọc thực thi nghiêm ngặt thẩm quyền gọi từ trên xuống (Strict Downward Call Authority): các tầng trên điều phối luồng công việc, các tầng giữa tính toán trạng thái miền và bằng chứng, còn tầng dưới cùng thực thi các nguyên hàm hệ điều hành/mạng được cô lập tác dụng phụ (Side-Effect-Isolated OS/Network Primitives).

```mermaid
graph TD
    subgraph Stratum0["Tầng 0: Điểm nhập Máy chủ & Chặn bắt Điểm móc (Stratum 0: Host Entrypoint & Hook Interception)"]
        S0["typesafe-planner.ts\n(registerTool, on('session_start' | 'tool_call' | 'tool_result' | ...))"]
    end

    subgraph Stratum1["Tầng 1: Thời gian chạy Phiên & Thẩm quyền (Stratum 1: Session Runtimes & Authorities)"]
        S1A["ContractRuntime\n(contract-runtime.ts)"]
        S1B["TaskEvidenceRuntime\n(task-evidence-runtime.ts)"]
        S1C["TaskVerificationRuntime\n(task-verification-runtime.ts)"]
        S1D["AdvisorHost & Runtime\n(advisor-host.ts, advisor-runtime.ts)"]
        S1E["TodoLifecycleAuthority\n(todo-lifecycle-authority.ts)"]
        S1F["EvaluationHost\n(evaluation-host.ts)"]
    end

    subgraph Stratum2["Tầng 2: Bộ máy Miền & Trọng tài Đồng thuận (Stratum 2: Domain Engines & Consensus Arbiters)"]
        S2A["Chiếu Lịch sử (History Projection)\n(host-history.ts, task-contract-history.ts)"]
        S2B["Bộ tạo Gói & Biên lai (Packet & Receipt Builder)\n(judge-evidence-packet.ts, verification-receipt.ts)"]
        S2C["Đồng thuận Lưỡng viện & Cổng kiểm tra (Bicameral Consensus & Gates)\n(bicameral-consensus.ts, cook-expert-judge.ts, verification-gate.ts)"]
        S2D["Thẩm phán Nguyên tử (Atomic Judge H)\n(atomic-judge.ts, atomic-evaluation.ts)"]
        S2E["Bộ đánh giá Kế hoạch & Tranh biện (Plan & Debate Evaluators)\n(plan-evaluator.ts, debate-evaluator.ts)"]
    end

    subgraph Stratum3["Tầng 3: Bảo mật, Che giấu & Nguyên hàm Hệ điều hành (Stratum 3: Security, Redaction & OS Primitives)"]
        S3A["Vào/Ra Bằng chứng & Ảnh chụp (Evidence & Snapshot IO)\n(evidence-workspace.ts, evidence-collector.ts, typesafe-evidence-file.cjs)"]
        S3B["Cô lập Tiến trình Con (Child Process Isolation)\n(typesafe-child-env.cjs: buildChildEnvironment, createVerificationHome)"]
        S3C["Trình khách Chính sách & Truyền tải (Policy & Transport Client)\n(typesafe-policy-client.cjs, typesafe-api-client.cjs, semantic-judge-client.ts)"]
        S3D["Che giấu Đầu ra & Chốt chặn AST (Egress Redaction & AST Guard)\n(typesafe-redact.cjs, typesafe-redact-patterns.cjs, payload-safety.ts, ast-analyzer.ts)"]
    end

    S0 --> S1A & S1B & S1C & S1D & S1E & S1F
    S1A --> S2A
    S1B --> S2A & S2B & S3A
    S1C --> S2A & S2C
    S1D --> S2A & S3C & S3D
    S1E --> S2A & S3A
    S1F --> S2D & S1D
    S2B --> S3A & S3B & S3D
    S2C --> S3C & S3D
    S2D --> S3C & S3D
    S2E --> S3C & S3D
```

### 2.2 Đồ thị Tương tác Ngang hàng — Cộng tác Luồng công việc Liên miền (Horizontal Peer Interaction Graph)

Xuyên suốt vòng đời của một nhiệm vụ theo giai đoạn, 5 thời gian chạy ngang hàng (Peer Runtimes) cộng tác theo chiều ngang thông qua các mã băm SHA-256 bất biến và các mục nhánh đã hoàn tất (Settled Branch Entries) thay vì chia sẻ trạng thái khả biến:

```mermaid
graph LR
    H_Hist["1. Lịch sử Nhánh Máy chủ (Host Branch History)\n(readHostBranch)"]
    H_Bind["2. ContractRuntime\n(typesafe_bind_task)"]
    H_Evid["3. TaskEvidenceRuntime\n(typesafe_collect_evidence)"]
    H_Ver["4. TaskVerificationRuntime\n(typesafe_review_task)"]
    H_Adv["5. AdvisorHost\n(typesafe_prepare_advisor + task)"]
    H_Todo["6. Todo Gốc Có Bảo vệ (Guarded Native Todo)\n(stageNativeTodoCall -> commit)"]

    H_Hist -->|"incarnationId + userEntryId"| H_Bind
    H_Bind -->|"TaskContract đóng băng + WorkspaceSnapshot cơ sở"| H_Evid
    H_Evid -->|"TaskEvidenceRecord + JudgeEvidencePacket 32 KiB"| H_Ver
    H_Ver -->|"REVIEW_REQUIRED + publicPrompt"| H_Adv
    H_Adv -->|"AdvisorReceipt đã hoàn tất trong lịch sử nhánh"| H_Ver
    H_Ver -->|"NativeTaskVerificationStage (APPROVED_PENDING_COMMIT)"| H_Todo
    H_Todo -->|"toolResult đã hoàn tất + dữ kiện native_commit"| H_Hist
```

---

## 3. Các Mô hình Máy Trạng thái Hình thức (Formal State Machine Models — 6 Máy Trạng thái Cốt lõi)

### 3.1 Máy Trạng thái 1: Vòng đời Hóa thân Nhiệm vụ & Hợp đồng (Task Incarnation & Contract Lifecycle — `src/task-contract-history.ts`, `src/contract-runtime.ts`)

```mermaid
stateDiagram-v2
    [*] --> UNCONTRACTED: Lệnh todo(op="init" | "append") gốc đã hoàn tất trong nhánh
    UNCONTRACTED --> BOUND: typesafe_bind_task (hóa thân creationKnown duy nhất + đã chụp cơ sở)
    BOUND --> CONTRACT_REVISED: typesafe_bind_task với kế hoạch/pha cập nhật và ctx.ui.confirm
    CONTRACT_REVISED --> BOUND: Ghi nối tiếp revisionId mới vào omp.typesafe.contract.v1

    BOUND --> DEBT_ATTACHED: Cổng 1/2 trả về REJECTED hoặc lỗi todo gốc chưa phân loại
    DEBT_ATTACHED --> BOUND: Cập nhật bằng chứng mã nguồn/kiểm thử liên quan (progressDigest mới)

    BOUND --> COMPLETED: Đã dàn dựng APPROVED_PENDING_COMMIT + hoàn tất todo(op="done") gốc
    BOUND --> BLOCKED: typesafe_prepare_todo_mutation(block) + RecoveryHandoff + todo(op="block") gốc
    BLOCKED --> BOUND: Lệnh todo(op="unblock") gốc

    BOUND --> ABANDONED_OR_REMOVED: typesafe_prepare_todo_mutation(drop/rm/init) + ui.confirm + todo gốc
    DEBT_ATTACHED --> HISTORICAL_DEBT: Hóa thân bị đóng/thay thế khi nợ vẫn chưa được giải quyết
    HISTORICAL_DEBT --> HUMAN_RECONCILED: typesafe_resolve_historical_debt (ui.confirm, không cấp quyền gốc)
    COMPLETED --> [*]
    HUMAN_RECONCILED --> [*]
```

---

### 3.2 Máy Trạng thái 2: Đánh giá theo Giai đoạn & Đồng thuận Lưỡng viện (Staged Review & Bicameral Consensus — `src/task-verification-runtime.ts`, `src/bicameral-consensus.ts`)

```mermaid
stateDiagram-v2
    [*] --> UNREVIEWED: Đã ràng buộc TaskContract
    UNREVIEWED --> EVIDENCE_COLLECTED: typesafe_collect_evidence -> status="COLLECTED" (1 gói hoàn chỉnh <= 32 KiB)
    UNREVIEWED --> CURATION_REQUIRED: Gói > 32 KiB hoặc còn tiêu chí chưa được bao phủ
    CURATION_REQUIRED --> EVIDENCE_COLLECTED: Thu thập lại với các lựa chọn khoảng dòng tường minh

    EVIDENCE_COLLECTED --> GATE1_CHECK: Gọi typesafe_review_task
    GATE1_CHECK --> REJECTED_RATCHET: Chạm vào .claude, testExitCode != 0, hoặc phát hiện lách kiểm thử AST
    GATE1_CHECK --> MACRO_M_EVAL: Vượt qua Cổng 1 -> evaluateMonolithicTask (jev-latest)

    MACRO_M_EVAL --> UNAVAILABLE_RATCHET: Lỗi HTTP/Xác thực hoặc nguyên hàm phản hồi sai định dạng
    MACRO_M_EVAL --> EVIDENCE_REQUIRED_RATCHET: NEXT_ACTION_REQUIRED, thiếu tiêu chí, hoặc 0.25 <= P <= ngưỡng
    MACRO_M_EVAL --> REJECTED_RATCHET: deliverables_verdict="REJECT", P < 0.25, drift != "no_drift", hoặc violated
    MACRO_M_EVAL --> REVIEW_REQUIRED: M đã phê duyệt, nhưng chưa có AdvisorReceipt hoàn tất

    REVIEW_REQUIRED --> ADVISOR_SETTLED: typesafe_prepare_advisor -> task gốc -> toolResult đã hoàn tất
    ADVISOR_SETTLED --> BICAMERAL_ARBITRATION: Lần gọi typesafe_review_task thứ 2 (tái sử dụng kết quả M lưu đệm)

    BICAMERAL_ARBITRATION --> HUMAN_REQUIRED: Bất đồng giữa 2 thùy (proceed vs REJECT / block vs APPROVE) hoặc attempt >= 3
    BICAMERAL_ARBITRATION --> REJECTED_RATCHET: Phán quyết của Advisor verdict="block"
    BICAMERAL_ARBITRATION --> EVIDENCE_REQUIRED_RATCHET: Phán quyết của Advisor verdict="revise" hoặc thiếu độ phủ tiêu chí
    BICAMERAL_ARBITRATION --> APPROVED_PENDING_COMMIT: M="APPROVE" VÀ Advisor="proceed" (consensus:<sha256>)

    REJECTED_RATCHET --> EVIDENCE_COLLECTED: Tác tử sửa mã nguồn/kiểm thử (progressDigest mới)
    EVIDENCE_REQUIRED_RATCHET --> EVIDENCE_COLLECTED: Tác tử bổ sung bằng chứng còn thiếu (progressDigest mới)
    UNAVAILABLE_RATCHET --> GATE1_CHECK: Đã tiêu thụ quan sát tính khả dụng sau lỗi
    APPROVED_PENDING_COMMIT --> [*]: Được tiêu thụ bởi tiền trạm todo(op="done") gốc và cam kết nhánh
```

---

### 3.3 Máy Trạng thái 3: Điều phối & Trung gian Tác tử con Advisor Gốc (Native Advisor Subagent Dispatch & Mediation — `src/advisor-runtime.ts`, `src/advisor-host-*.ts`)

```mermaid
stateDiagram-v2
    [*] --> IDLE: Khởi tạo HostScope tại sự kiện session_start
    IDLE --> PROVISIONAL_PREPARED: typesafe_prepare_advisor / typesafe_advisor đúc mã UUID reviewHandle
    PROVISIONAL_PREPARED --> DISPATCH_FRAME_ACTIVE: Tác tử cha gọi task gốc (1 mục, khớp với bản tạm thời)

    DISPATCH_FRAME_ACTIVE --> CHILD_SPAWN_AUTHORIZED: before_subagent_spawn xác minh advisorDispatchFrame
    CHILD_SPAWN_AUTHORIZED --> CHILD_LOCKED_READONLY: before_agent_start thiết lập ChildRoute và tools={read,grep,glob,yield}

    state CHILD_LOCKED_READONLY {
        [*] --> SanitizeProviderPayload: context + before_provider_request (store=false, <=256 KiB)
        SanitizeProviderPayload --> MediatedReadTool: Tác tử con gọi read(:start-end) / grep nguyên văn / glob
        MediatedReadTool --> VerifyExactFileSha: executeAdvisorRead kiểm tra SHA-256 đĩa == SHA-256 ảnh chụp
        VerifyExactFileSha --> SanitizeProviderPayload: Đầu ra đã che giấu <=16 KiB được công bố vào ReadSession
        SanitizeProviderPayload --> StructuredYield: Tác tử con gọi yield(advisorOutputSchema)
    }

    CHILD_LOCKED_READONLY --> RECEIPT_MINTED: validateAssessmentForRequest đạt -> advisor-receipt:<sha256>
    RECEIPT_MINTED --> SETTLED_APPLICABLE: Dòng toolResult của task gốc bên ngoài đã hoàn tất trong lịch sử nhánh
    CHILD_LOCKED_READONLY --> INVALIDATED_STALE: Mã SHA tệp được đánh giá thay đổi trên đĩa hoặc xoay vòng kỷ nguyên phiên
    DISPATCH_FRAME_ACTIVE --> BUDGET_ABORTED: Quá hạn SemanticReviewScheduler (300s) -> xả luồng 250ms
    SETTLED_APPLICABLE --> INVALIDATED_STALE: Phiên bản hợp đồng hoặc treeDigest không gian làm việc thay đổi (applicable=false)
```

---

### 3.4 Máy Trạng thái 4: Nghĩa vụ EGC & Vòng đời Cổng Cây làm việc (EGC Obligation & Worktree Gate Lifecycle — `src/egc.ts`, `src/egc-native.ts`)

```mermaid
stateDiagram-v2
    [*] --> UNLOCKED: Có tệp .omp/egc.json nhưng chưa có contract.lock khớp
    UNLOCKED --> OPEN_UNASSESSED: Người vận hành chạy /egc lock (ghi ~/.omp/egc/<ws>-<sha8>/contract.lock)

    OPEN_UNASSESSED --> WORKTREE_GATE: Tác tử gọi todo(op="done", task) (một mục tiêu duy nhất không nhập nhằng)
    state WORKTREE_GATE {
        [*] --> ScreenDiffAndFiles: Kiểm tra tệp <=128 KiB, tệp oracle bảo vệ, biểu thức HARD/SOFT, planFiles
        ScreenDiffAndFiles --> DetachedWorktreeExec: git worktree add --detach -> chạy setup + verify + holdout
        DetachedWorktreeExec --> JevScreening: Nếu jev.mode != "off", đánh giá stub, tamper, impl_r1..N
    }

    WORKTREE_GATE --> ASSESSED_READY: Mọi kiểm tra tất định + JEV đều đạt (ghi nhận passFp, cấp stage)
    WORKTREE_GATE --> ASSESSED_REJECTED_PROGRESS: Cổng thất bại, nhưng score < best (cập nhật best, đặt lại stalls = 0)
    WORKTREE_GATE --> ASSESSED_REJECTED_STALL: Cổng thất bại, fp == prevFp HOẶC score >= best (tăng stalls++)

    ASSESSED_REJECTED_PROGRESS --> OPEN_UNASSESSED: Tác tử chỉnh sửa mã nguồn
    ASSESSED_REJECTED_STALL --> OPEN_UNASSESSED: stalls < maxStalls (mặc định 2)
    ASSESSED_REJECTED_STALL --> STALLED_LOCKED: stalls >= maxStalls (chặn lệnh todo done)
    STALLED_LOCKED --> OPEN_UNASSESSED: Người vận hành chạy /egc reset <id>

    ASSESSED_READY --> OPEN_UNASSESSED: Bất kỳ công cụ ghi tệp nào được gọi trước khi cam kết (ledger.revoke())
    ASSESSED_READY --> COMPLETED: Đã cam kết toolResult của todo gốc hoàn tất trong nhánh
    COMPLETED --> OPEN_UNASSESSED: Kiểm tra hồi quy tại session_stop thất bại (mở lại nhiệm vụ và buộc tiếp tục)
    COMPLETED --> [*]: Vượt qua kiểm tra hồi quy và bộ kiểm thử cuối cùng tại session_stop
```

---

### 3.5 Máy Trạng thái 5: Thời gian hồi Thông tin xác thực, Thử lại & Quản lý Xác thực (Credential Cooldown, Retry & Auth Manager — `src/typesafe-api-client.cjs`, `src/auth-manager.ts`)

```mermaid
stateDiagram-v2
    [*] --> AUTHENTICATED_READY: TYPESAFE_API_KEY hợp lệ khác rỗng (mã băm thông tin xác thực SHA-256)
    AUTHENTICATED_READY --> IN_FLIGHT_ATTEMPT: requestWithRetry (lần thử 1..3, ngân sách <= 15,000ms)

    IN_FLIGHT_ATTEMPT --> AUTHENTICATED_READY: HTTP 200 OK + sanitizeAnswers hợp lệ
    IN_FLIGHT_ATTEMPT --> BACKOFF_RETRY: HTTP 429 hoặc 529 (lần thử < 3, remainingBudget >= 1,000ms)
    BACKOFF_RETRY --> IN_FLIGHT_ATTEMPT: Chờ Retry-After (<=5,000ms + 250ms nhiễu ngẫu nhiên) hoặc lùi lũy thừa

    IN_FLIGHT_ATTEMPT --> COOLDOWN_45S: HTTP 429/529 đã cạn kiệt cả 3 lần thử hoặc ngân sách thời gian
    COOLDOWN_45S --> AUTHENTICATED_READY: Đã trôi qua 45,000ms thời gian hồi hoặc gọi resetRateLimitState()

    IN_FLIGHT_ATTEMPT --> REFRESHING_SINGLE_RETRY: HTTP 401/403 (AuthManager failureCount == 1)
    REFRESHING_SINGLE_RETRY --> AUTH_REVOKED: Lần lỗi HTTP 401/403 thứ hai (công tắc ngắt authFailed = true)
    AUTH_REVOKED --> AUTHENTICATED_READY: Cung cấp mã băm TYPESAFE_API_KEY mới hoặc gọi AuthManager.reset()
```

---

### 3.6 Máy Trạng thái 6: Đồng bộ Đường cơ sở Giao dịch (Transactional Baseline Sync — `tools/sync-baseline.cjs`)

```mermaid
stateDiagram-v2
    [*] --> PREFLIGHT_READONLY: Xác minh 7 tệp CJS, Loader Proxy 1 dòng, không symlink/hardlink, 5 gốc tách biệt
    PREFLIGHT_READONLY --> LOCK_ACQUIRED: Tạo khóa độc quyền .omp-sync-<hash>.lock (cờ wx)
    LOCK_ACQUIRED --> POST_LOCK_VERIFIED: Tính lại kế hoạch sau khóa == định danh kế hoạch trước khóa
    LOCK_ACQUIRED --> ABORT_PLAN_CHANGED: Lệch kế hoạch trước khóa so với sau khóa (thoát với mã 1)

    POST_LOCK_VERIFIED --> STAGED_AND_BACKED_UP: Dàn dựng tệp, ghi omp_extension_backup_<ISO>/.sync-journal.json (IN_PROGRESS)
    STAGED_AND_BACKED_UP --> MUTATIONS_APPLIED: Ghi nguyên tử tmp+fsync+rename trên target, global_omp_agents (Schema v2) + dọn tệp cũ
    MUTATIONS_APPLIED --> VERIFY_ISOLATED_TESTS: Ghi .sync-manifest.json, chạy bun test bên trong createVerificationHome()

    VERIFY_ISOLATED_TESTS --> DEPLOYED_VERIFIED: bun test có exitCode == 0 -> trạng thái nhật ký = DEPLOYED_VERIFIED, nhả khóa (thoát 0)
    MUTATIONS_APPLIED --> ROLLING_BACK: Lỗi ghi/dọn tệp hoặc tiêm lỗi kiểm thử
    VERIFY_ISOLATED_TESTS --> ROLLING_BACK: bun test thất bại hoặc hết thời gian chờ

    ROLLING_BACK --> RECOVERED: Khôi phục tiền ảnh theo thứ tự ngược + khôi phục bảng kê thành công, nhả khóa (thoát 1)
    ROLLING_BACK --> RECOVERY_INCOMPLETE: Lỗi hoàn nguyên -> giữ lại khóa .omp-sync-<hash>.lock để người vận hành kiểm tra (thoát 2)
```
