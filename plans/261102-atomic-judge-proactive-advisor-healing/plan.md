---
title: "Thẩm phán Nguyên tử Jev, Cố vấn Chữa lành Tự động & Chốt chặn Middleware Chống Treo Todo"
description: "Hiện thực hóa hệ thống Thẩm phán nguyên tử (Atomic TypeSafe Jev Judge), vòng lặp Cố vấn tự động chữa lành (Proactive Advisor Remediation Loop) và chốt chặn middleware cấm ask về lỗi kỹ thuật / cấm tự ý block todo theo ADR-20261102."
status: completed
priority: P1
effort: "4 phases"
branch: master
tags: [typesafe-jev, atomic-judge, proactive-advisor, anti-blocking, middleware]
blockedBy: []
blocks: []
created: 2026-11-02
supersededBy: "261102-atomic-judge-proactive-advisor-healing"
completedInCycle: "2026-11-02"
verificationSuite: "tests/atomic-jev-judge.test.ts, tests/proactive-advisor-dispatch.test.ts"
---

# Thẩm phán Nguyên tử Jev, Cố vấn Chữa lành Tự động & Chốt chặn Middleware Chống Treo Todo

## Tổng quan (Overview)

Triển khai kiến trúc Tam giác Tự trị (Autonomous Triad) kết hợp giải pháp Native Judge OMP và chốt chặn Middleware theo `docs/decisions/ADR-20261102-atomic-judge-proactive-advisor-autonomous-healing.md`:
1. **Chốt chặn Middleware (Middleware Guards)**: Cấm tác tử dùng công cụ `ask` để hỏi người dùng về lỗi kỹ thuật/code, cấm tự tiện đẩy todo vào trạng thái `blocked`, và tự động nhúng mô tả điều phối Cố vấn (`Advisor remediation descriptor`) khi có lỗi.
2. **Thẩm phán Nguyên tử (Atomic TypeSafe Jev Judge)**: Kiểm tra và chấm điểm tức thì các thay đổi vi mô (diffs/AST) qua Judge bản địa (`modelRoles.judge` với Jev System One) theo các câu hỏi nguyên tử (`bool`, `choice`, `score`), đảm bảo đúng ngay từ các bước nhỏ.
3. **Cố vấn Chữa lành Chủ động (Proactive Advisor Remediation Loop)**: Tự động triệu hồi Advisor (`agents/advisor.md`) khi Judge không đạt, phân tích nguyên nhân gốc rễ, lập giải pháp kỹ thuật, tái lập kế hoạch (re-plan) và chuyển giao cho tác tử thực thi triệt để.
4. **Kiểm chứng & Triển khai Giao dịch (Verification & Deployment)**: Chạy toàn bộ bộ kiểm thử đơn vị (`bun test`), đồng bộ sang môi trường đích bằng `tools/sync-baseline.cjs` và đối chiếu mã băm SHA-256 qua `tools/verify-omp-global.cjs`.

## Các giai đoạn thực hiện (Phases)

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Chốt chặn Middleware Chống Tra khảo & Chống Treo Todo](./phase-01-middleware-guards.md) | Completed |
| 2 | [Thẩm phán Jev Nguyên tử Từng bước](./phase-02-atomic-jev-judge.md) | Completed |
| 3 | [Cố vấn Chữa lành Chủ động & Tái lập Kế hoạch](./phase-03-proactive-advisor-dispatch.md) | Completed |
| 4 | [Kiểm thử Đơn vị, Đồng bộ Giao dịch & Xác minh Toàn cầu](./phase-04-verification-and-deployment.md) | Completed |
