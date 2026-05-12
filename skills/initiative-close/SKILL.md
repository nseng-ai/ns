---
name: initiative-close
description: "Command: initiative-close"
---

# initiative-close

Close an Initiative without deleting its checked-in history.

Source of truth: read `CONTEXT.md` for domain language and `docs/initiative-system.md` for mechanics, then follow the `initiative-close` operation contract.

Stub guardrails:

- V1 is markdown-only; do not add or call Python CLI tooling.
- Resolve the Initiative by explicit slug/path or touched `.asdl/initiatives/<slug>/` files; ask if ambiguous.
- Add closure context under `## Closure` in `initiative.md`.
- Write `closed.md` as the Closure Marker.
- Leave the Initiative directory in place; do not archive, delete, or implement reopen behavior.
