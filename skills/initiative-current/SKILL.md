---
name: initiative-current
description: "Command: initiative-current"
---

# initiative-current

Read and summarize the current state of one Initiative.

Source of truth: read `docs/initiative-system.md`, then follow the `initiative-current` operation contract.

Stub guardrails:

- V1 is markdown-only; do not add or call Python CLI tooling.
- Resolve the Initiative by explicit slug/path or touched `.asdl/initiatives/<slug>/` files; ask if ambiguous.
- Read `initiative.md`, `roadmap.md`, recent `updates/`, and `closed.md` presence.
- Report whether the Initiative is closed.
- Do not mutate files.
