---
name: initiative-create
description: "Command: initiative-create"
---

# initiative-create

Create a new Initiative record.

Source of truth: read `CONTEXT.md` for domain language and `docs/initiative-system.md` for mechanics, then follow the `initiative-create` operation contract.

Stub guardrails:

- V1 is markdown-only; do not add or call Python CLI tooling.
- Use `.asdl/initiatives/<slug>/` only; do not use `docs/initiatives/` or objective-system mechanics.
- Require an explicit slug or explicit confirmation of a proposed slug.
- Create `initiative.md`, `roadmap.md`, and `updates/` with the standardized headings.
- Do not create an initial update file or `closed.md`.
