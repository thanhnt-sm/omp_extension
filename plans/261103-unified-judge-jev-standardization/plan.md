---
title: "Chuẩn hóa & Triển khai Kiến trúc Thống nhất Vòng lặp Tự trị Tam giác Đa tầng (Autonomous Triad Unified Architecture) theo ADR-13"
description: "Kế hoạch tổng lực triển khai và cutover toàn bộ các giải pháp nghiên cứu từ ADR-13: Hỗ trợ đa dialect System One (OpenRouter/Cloudflare), Box Question thị giác, Động cơ điều phối đa tầng (Preflight 0ms -> Macro M -> Atomic H -> Proactive Advisor), kiểm thử TDD toàn diện và xác minh 6 tầng toàn cầu."
status: completed
priority: P1
effort: "5 phases"
branch: master
tags: [typesafe-jev, native-judge, multi-dialect, box-primitive, unified-triad, proactive-advisor, tdd]
blockedBy: []
blocks: []
created: 2026-11-03
verificationSuite: "tests/box-primitive.test.ts, tests/visual-evidence-*.test.ts, tests/task-verification-runtime.test.ts, tests/anti-blocking-middleware.test.ts, tests/h-authority-boundary.test.ts"
---

# Chuẩn hóa & Triển khai Kiến trúc Thống nhất Vòng lặp Tự trị Tam giác Đa tầng theo ADR-13

> **Phạm vi đã thu hẹp (2026-11-11)**: Tầng 3 (tự động leo thang `M` → `H`) bị loại theo [`ADR-20261111-defer-macro-to-atomic-escalation`](../../docs/decisions/ADR-20261111-defer-macro-to-atomic-escalation.md); `H` vẫn chỉ chạy bóng. Hook tự động chụp ảnh trình duyệt (giai đoạn 2) hoãn, đưa vào backlog. Phần mô tả bốn tầng bên dưới giữ nguyên để truy vết, không phải phạm vi đã giao.

## 1. Bối cảnh & Mục tiêu (Context & Objectives)

Theo kết luận của Hội đồng Thẩm định Kỹ thuật [`docs/decisions/ADR-20261103-unified-judge-jev-architectural-standardization.md`](../../docs/decisions/ADR-20261103-unified-judge-jev-architectural-standardization.md) và Báo cáo Kiểm toán Toàn cảnh [`docs/research/omp-judge-and-typesafe-jev-comprehensive-audit.md`](../../docs/research/omp-judge-and-typesafe-jev-comprehensive-audit.md), hệ thống quyết định triển khai **Phương án D: Kiến trúc Thống nhất Vòng lặp Tự trị Tam giác Đa tầng (`Autonomous Triad Unified Architecture`)**.

### Mục tiêu Cốt lõi:
1. **Đa dialect System One**: Bổ sung hỗ trợ OpenRouter Decisions (`/decisions`) và Cloudflare Clef (`/client/v4/accounts/.../clef`) dự phòng ngoại tuyến cho `src/typesafe-api-client.cjs`.
2. **Nguyên hàm Box & Bằng chứng Thị giác**: Hiện thực hóa `BoxQuestion` của JEV 1.14+ và bộ thu thập bằng chứng giao diện thị giác trong `src/task-evidence-runtime.ts` & `src/judge-evidence-packet.ts`.
3. **Động cơ Điều phối Đa tầng Thống nhất**: Kết nối liền mạch:
   - Tầng 1: Preflight phản xạ 0ms (`APPROVED_PENDING_COMMIT`)
   - Tầng 2: Thẩm phán Vĩ mô `Repaired-M` ($\le 32\text{KB}$) + Cố vấn Lưỡng viện
   - Tầng 3: Tự động leo thang Thẩm phán Vi hạt Nguyên tử `Atomic-H` (DAG) khi phát hiện mâu thuẫn tiêu chí
   - Tầng 4: Chốt chặn Middleware cấm `ask` spam / cấm `block` + Cố vấn tự động chữa lành (`proactive-advisor-dispatch.ts`)
4. **Kiểm thử TDD Toàn diện**: Xây dựng bộ kịch bản kiểm thử biên (`tests/unified-triad-architecture.test.ts`) kiểm chứng 100% các tình huống tấn công, rớt mạng, và trốn tránh kiểm thử.
5. **Đồng bộ Giao dịch & Xác minh 6 Tầng**: Tích hợp Bản kê Schema v2, chạy `tools/sync-baseline.cjs` và đối chiếu `tools/verify-omp-global.cjs --live`.

---

## 2. Các Giai đoạn Thực thi (Phases Roadmap)

| Giai đoạn (Phase) | Tệp Kế hoạch (Plan File) | Trọng tâm Triển khai (Focus Areas) | Trạng thái (Status) |
|---|---|---|:---:|
| **Giai đoạn 1** | [phase-01-multi-provider-wire-support.md](phase-01-multi-provider-wire-support.md) | Mở rộng Hỗ trợ Đa dialect Wire System One (OpenRouter / Cloudflare) trong trình khách API | Completed |
| **Giai đoạn 2** | [phase-02-box-primitive-and-visual-evidence.md](phase-02-box-primitive-and-visual-evidence.md) | Hiện thực hóa Box Primitive (`BoxQuestion`) & Gói Bằng chứng Thị giác UI | Completed (hook chụp ảnh tự động: hoãn) |
| **Giai đoạn 3** | [phase-03-unified-triad-runtime-escalation.md](phase-03-unified-triad-runtime-escalation.md) | Thu hẹp phạm vi (2026-11-11): gia cố T1/T4 tighten-only; T3 (leo thang M→H) hoãn, cần ADR riêng | Completed (phạm vi thu hẹp; advisor review, judge unavailable) |
| **Giai đoạn 4** | [phase-04-tdd-edge-case-scenarios.md](phase-04-tdd-edge-case-scenarios.md) | Bộ Kiểm thử TDD Hồi quy Toàn diện & Xác thực Đa kịch bản Ma trận Biên (bỏ SC-07) | Completed (advisor review, judge unavailable) |
| **Giai đoạn 5** | [phase-05-sync-baseline-and-global-verification.md](phase-05-sync-baseline-and-global-verification.md) | Đồng bộ Giao dịch, Cập nhật Sổ cái Kế hoạch & Xác minh 6 Tầng Toàn cầu | Completed (advisor review, judge unavailable) |

---

## 3. Tiêu chí Chấp thuận Tổng thể (Master Acceptance Criteria)

- [x] Trình khách API hỗ trợ đầy đủ 3 dialect wire: `typesafe`, `openrouter-decisions`, `workers-ai-systemone`.
- [x] Xử lý an toàn `BoxQuestion` với độ tự tin và tọa độ bounding box chuẩn hóa `[top, bottom, left, right]`.
- [bỏ — Tầng 3 hoãn theo ADR-20261111-defer-macro-to-atomic-escalation; độ trễ không đo trong phạm vi này] Chuỗi điều phối phân tầng chuyển tiếp mượt mà, không tăng đột biến độ trễ đối với các tác vụ đơn giản.
- [x] Bộ kiểm thử đơn vị `tests/unified-triad-architecture.test.ts` đạt 100% PASS với 0 fail (21/21; toàn bộ suite 1251 pass / 0 fail / 5 skip).
- [x] `node tools/verify-omp-global.cjs --live` đạt 6/6 tầng PASS (`bun run verify:live`, 2026-11-12, đo tại commit `325fedd`, 620/620 tệp, `jev-1.14.0` HTTP 200).
- [x] `node tools/ck-project-manager.cjs --audit` đạt 100% hoàn thành đối soát (37/37, 2026-11-12).
