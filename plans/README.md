# Bảng Theo Dõi Kế Hoạch & Tiến Độ (ClaudeKit Project Plan Ledger)

> **Tiêu chuẩn (Standard):** Tuân thủ `ck:project-management` (Sync-Back Guard) và `ck:project-organization` (Lineage & Inheritance Pattern).  
> **Cập nhật lần cuối (Last Updated):** 2026-11-11  
> **Tổng số kế hoạch (Total Plans):** 37 | **Đã hoàn thành (Completed):** 37 | **Đang thực hiện (In-Progress):** 0 | **Chờ xử lý (Pending):** 0

---

## 1. Nguyên Tắc Thừa Kế & Không Làm Lại Việc Cũ (Inheritance & Non-Duplication Principle)
1. **Kế Thừa Bất Biến (Immutable Inheritance)**: Mỗi vòng lặp (`ck:cook` / `ck:loop`) BẮT BUỘC phải đọc sổ cái `plans/plan-ledger.json` trước khi khởi tạo hoặc thực thi bất kỳ nhiệm vụ nào.
2. **Không Tái Thi Công (Never Redo Completed Work)**: Các kế hoạch đã có trạng thái `completed` hoặc được thay thế bởi các quyết định kiến trúc mới hơn (ví dụ: `ADR-20261102`, `plans/261102-atomic-judge-proactive-advisor-healing`) là nguồn sự thật lịch sử đã được kiểm chứng bằng `bun test`.
3. **Đồng Bộ Ngược Toàn Diện (Full Sync-Back Guard)**: Mọi thao tác đánh dấu hoàn tất phải quét sạch toàn bộ các tệp `phase-*.md` con, đóng toàn bộ hộp kiểm `[x]` để tránh tình trạng lệch pha tiến độ.

---

## 2. Danh Sách Chi Tiết Toàn Bộ Kế Hoạch (Detailed Plan Inventory)

| Mã Kế Hoạch (Plan ID) | Tiêu Đề (Title) | Trạng Thái (Status) | Hộp Kiểm Kế Hoạch (Plan) | Hộp Kiểm Giai Đoạn (Phases) |
|---|---|---|---|---|
| [`261001-auth-error-visibility`](./261001-auth-error-visibility/plan.md) | Auth Error Visibility Enhancement | ✅ **Completed** | [0/0] | [7/7] (3 pha) |
| [`261001-typesafe-concerns`](./261001-typesafe-concerns/plan.md) | TypeSafe Judge Concerns Resolution | ✅ **Completed** | [0/0] | [16/16] (4 pha) |
| [`261001-typesafe-role-judge-validation`](./261001-typesafe-role-judge-validation/plan.md) | TypeSafe Role Judge Validation Plan (TDD & Cross-Workspace) | ✅ **Completed** | [0/0] | — |
| [`261002-cook-mandatory-typesafe-verification`](./261002-cook-mandatory-typesafe-verification/plan.md) | Mandatory TypeSafe Judge & Expert Evaluation in Cook Workflow | ✅ **Completed** | [7/7] | [17/17] (4 pha) |
| [`261002-typesafe-compliance-elevation`](./261002-typesafe-compliance-elevation/plan.md) | TypeSafe Plan Compliance & Elevation System | ✅ **Completed** | [7/7] | [20/20] (4 pha) |
| [`261002-typesafe-judge-alignment-fix`](./261002-typesafe-judge-alignment-fix/plan.md) | TypeSafe System One Judge Definitive Alignment and Zero-Conflict Architecture | ✅ **Completed** | [0/0] | [23/23] (5 pha) |
| [`261003-planner-import-proxy`](./261003-planner-import-proxy/plan.md) | 261003-planner-import-proxy | ✅ **Completed** | [3/3] | — |
| [`261003-rerank-orchestrator`](./261003-rerank-orchestrator/plan.md) | 261003-rerank-orchestrator | ✅ **Completed** | [0/0] | — |
| [`261003-typesafe-best-practice-alignment`](./261003-typesafe-best-practice-alignment/plan.md) | TypeSafe Best Practice Alignment Plan | ✅ **Completed** | [0/0] | — |
| [`261003-typesafe-stability-guardrails`](./261003-typesafe-stability-guardrails/plan.md) | TypeSafe Stability Guardrails, Active Health Watchdog & Integrity Shield | ✅ **Completed** | [4/4] | [12/12] (4 pha) |
| [`261004-redteam-egc-hardening`](./261004-redteam-egc-hardening/plan.md) | Red-Team Hardening and EGC Harmonization | ✅ **Completed** | [0/0] | [13/13] (4 pha) |
| [`261004-typesafe-judge-hardening`](./261004-typesafe-judge-hardening/plan.md) | Context | ✅ **Completed** | [12/12] | — |
| [`261005-predict-recommendations`](./261005-predict-recommendations/plan.md) | Implement Multi-Persona Predict Recommendations | ✅ **Completed** | [0/0] | [8/8] (3 pha) |
| [`261005-typesafe-judge-enhancement`](./261005-typesafe-judge-enhancement/plan.md) | Context | ✅ **Completed** | [0/0] | — |
| [`261006-red-team-hardening`](./261006-red-team-hardening/plan.md) | Implement Red-Team Hardening & Community Solutions | ✅ **Completed** | [0/0] | [16/16] (5 pha) |
| [`261007-health-probe-analysis`](./261007-health-probe-analysis/plan.md) | Session Start Health Probe Dual-Notification Analysis & ck:predict Review | ✅ **Completed** | [4/4] | — |
| [`261007-key-isolation`](./261007-key-isolation/plan.md) | TypeSafe Key Isolation Plan | ✅ **Completed** | [0/0] | — |
| [`261007-typesafe-auto-completion`](./261007-typesafe-auto-completion/plan.md) | 261007-typesafe-auto-completion | ✅ **Completed** | [4/4] | — |
| [`261007-typesafe-fix`](./261007-typesafe-fix/plan.md) | typesafe-fix | ✅ **Completed** | [5/5] | — |
| [`261007-typesafe-lifecycle-gating`](./261007-typesafe-lifecycle-gating/plan.md) | TypeSafe Lifecycle Gating & Human Authorization Fix | ✅ **Completed** | [0/0] | [13/13] (3 pha) |
| [`261009-health-probe-transport-isolation`](./261009-health-probe-transport-isolation/plan.md) | Session Pre-Flight Health Probe Transport Scoping & Dual-Notification Fix | ✅ **Completed** | [5/5] | — |
| [`261012-judge-threshold-lifecycle-alignment`](./261012-judge-threshold-lifecycle-alignment/plan.md) | TypeSafe judge threshold and todo lifecycle alignment | ✅ **Completed** | [0/0] | [13/13] (4 pha) |
| [`261012-todo-drop-judge-fidelity`](./261012-todo-drop-judge-fidelity/plan.md) | TypeSafe todo drop gate and judge input fidelity | ✅ **Completed** | [0/0] | [0/0] (5 pha) |
| [`261012-typesafe-jev-alignment-fix`](./261012-typesafe-jev-alignment-fix/plan.md) | TypeSafe JEV Alignment Fix | ✅ **Completed** | [0/0] | [13/13] (4 pha) |
| [`261013-bicameral-judge-advisor-autonomous-execution`](./261013-bicameral-judge-advisor-autonomous-execution/plan.md) | Bicameral Judge-Advisor Autonomous Execution & Friction Minimization | ✅ **Completed** | [0/0] | — |
| [`261013-bicameral-judge-consensus`](./261013-bicameral-judge-consensus/plan.md) | TypeSafe Bicameral Judge Consensus, Threshold Elimination, and Adaptive Plan Reconciliation | ✅ **Completed** | [0/0] | [12/12] (4 pha) |
| [`261013-fix-advisor-decision-answering`](./261013-fix-advisor-decision-answering/plan.md) | Fix Advisor and ck:advisor Decision Answering & Context Extraction | ✅ **Completed** | [5/5] | — |
| [`261014-typesafe-jev-advisor-overhaul`](./261014-typesafe-jev-advisor-overhaul/plan.md) | TypeSafe, JEV & Bicameral Advisor Full Overhaul | ✅ **Completed** | [5/5] | [12/12] (4 pha) |
| [`261014-typesafe-todo-done-verdict-fidelity`](./261014-typesafe-todo-done-verdict-fidelity/plan.md) | TypeSafe Todo Done Verdict Fidelity and Calibration Alignment | ✅ **Completed** | [4/4] | [13/13] (4 pha) |
| [`261015-advisor-judge-jev-true-calibration`](./261015-advisor-judge-jev-true-calibration/plan.md) | Advisor 0.90 Calibration, Zero 0.80 Thresholds, and JEV State Fidelity | ✅ **Completed** | [4/4] | [11/11] (4 pha) |
| [`261015-judge-baseline-audit-cook`](./261015-judge-baseline-audit-cook/plan.md) | Judge Baseline Audit Implementation | ✅ **Completed** | [0/0] | [28/28] (7 pha) |
| [`261018-jev-session-forensics`](./261018-jev-session-forensics/plan.md) | JEV Session Forensics Evidence Audit | ✅ **Completed** | [0/0] | [26/26] (5 pha) |
| [`261019-jev-atomic-review`](./261019-jev-atomic-review/plan.md) | JEV Atomic Evidence Review and Advisor Synthesis | ✅ **Completed** | [0/0] | [19/19] (3 pha) |
| [`261019-research-to-cook-execution`](./261019-research-to-cook-execution/plan.md) | Complete TypeSafe Research Implementation and Atomic Advisor Execution | ✅ **Completed** | [7/7] | [75/75] (10 pha) |
| [`261027-native-omp-judge-typesafe-migration`](./261027-native-omp-judge-typesafe-migration/plan.md) | Cài Jev vào judge bản địa OMP rồi di chuyển các đánh giá nguyên tử | ✅ **Completed** | [0/0] | [20/20] (5 pha) |
| [`261102-atomic-judge-proactive-advisor-healing`](./261102-atomic-judge-proactive-advisor-healing/plan.md) | Thẩm phán Nguyên tử Jev, Cố vấn Chữa lành Tự động & Chốt chặn Middleware Chống Treo Todo | ✅ **Completed** | [0/0] | [12/12] (4 pha) |
| [`261103-unified-judge-jev-standardization`](./261103-unified-judge-jev-standardization/plan.md) | Chuẩn hóa & Triển khai Kiến trúc Thống nhất Vòng lặp Tự trị Tam giác Đa tầng (Autonomous Triad Unified Architecture) theo ADR-13 | ✅ **Completed** | [5/5] | [40/40] (5 pha) |

---
*Được tự động sinh bởi `tools/ck-project-manager.cjs`.*
