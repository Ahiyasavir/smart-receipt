---
name: feedback-workstyle
description: How the user wants this receipt-scanner project approached — priorities, rules, and session format
metadata:
  type: feedback
---

Always resume from RECEIPT_PIPELINE_STATE.md. Do not restart or repeat completed work.

**Why:** The project has multi-stage history; re-doing work wastes time.

**How to apply:** On every session start: read RECEIPT_PIPELINE_STATE.md, run git status, confirm baseline benchmark still passes before doing any new work.

---

Strict focus rules:
- No Hebrew support yet
- No backend, auth, Firebase, analytics, payments, social features
- No UI redesigns unless needed for correctness
- No unrelated features

**Why:** Keep scope tight; project is pipeline+benchmark only.

---

After each major step: update RECEIPT_PIPELINE_STATE.md with what changed, what's still weak, and benchmark results.

**Why:** Enables clean resume across sessions.

---

Session end report must include: what improved, what is still weak, benchmark results, robustness results, next best step, confirmation that build and benchmark still pass.
