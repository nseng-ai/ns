---
name: initiative-update
description: "Command: initiative-update"
---

# initiative-update

Update Initiative tracking for exactly one Initiative.

Source of truth: read `CONTEXT.md` for domain language and `docs/initiative-system.md` for mechanics, then follow the `initiative-update` operation contract.

Stub guardrails:

- V1 is markdown-only; do not add or call Python CLI tooling.
- Resolve one Initiative only; do not write multi-initiative updates.
- Edit `initiative.md` and/or `roadmap.md` when durable narrative or ordered guidance changed.
- Write a Semantic Update for meaningful findings, decisions, blockers, completion evidence, changed plans, or follow-ups.
- Do not update a closed Initiative unless the user explicitly asks to amend the closed record.
