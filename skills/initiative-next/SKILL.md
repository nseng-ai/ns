---
name: initiative-next
description: "Command: initiative-next"
---

# initiative-next

Recommend the next useful work for an active Initiative.

Source of truth: read `CONTEXT.md` for domain language and `docs/initiative-system.md` for mechanics, then follow the `initiative-next` operation contract.

Stub guardrails:

- V1 is markdown-only; do not add or call Python CLI tooling.
- Resolve the Initiative by explicit slug/path or touched `.asdl/initiatives/<slug>/` files; ask if ambiguous.
- Exclude closed initiatives by default.
- Apply the read-only Tracking Gate before recommending work.
- If material progress appears unrecorded, stop and ask for `initiative-update`.
- Do not mutate files.
