<!--
Canonical `notes.md` shape for the memjective subsystem. Durable findings,
constraints, collisions, and pointers discovered during implementation.

Rules:
- Append-only in spirit. When a note becomes obsolete, annotate it in
  place (e.g., `~~...~~ — superseded by slice 3`) rather than deleting it.
- Keep entries terse — one or two sentences plus a file/commit pointer
  when helpful. This is a knowledge log, not a changelog.
- Optional file. `dev-memjective-create` does not write this; it appears
  when `dev-memjective-update` records a branch finding or
  `dev-memjective-reconcile` folds a durable finding into canonical state.

Delete this HTML comment before use.
-->

# Notes

- Durable finding, constraint, collision, or pointer discovered during
  implementation
- Another durable note worth preserving for future sessions
