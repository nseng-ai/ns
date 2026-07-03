# Sibling specs corrected: no new sdl-named surface pre-cutover

## Summary

The pre-landing coordination row is done: the operative spec text in
`ship-objectives-to-customers` and `skill-management-subsystem` now names ji surfaces,
so neither Objective can scaffold the old namespace into new builds before the cutover
lands.

- `ship-objectives-to-customers`: `sdl init` → `ji init`, `@sdl/init` → `@ji/init`,
  `sdl skills install` → `ji skills install`, customer-facing `sdl objective …` →
  `ji objective …`, `.sdl/objectives/` → `.ji/objectives/`, `sdl.toml` → `ji.toml`,
  managed-block markers `sdl:objectives:*` → `ji:objectives:*` — across `objective.md`
  (Thesis, Scope, Non-Goals, Completion Criteria, Assumptions, Resolved Decisions,
  Open Questions) and all unbuilt-surface roadmap rows. A naming note anchored to
  ADR 0024 explains that prose says ji while the current binary is still sdl.
- `skill-management-subsystem`: product target renamed to the `ji` CLI throughout,
  candidate package names re-scoped `@sdl/*` → `@ji/*`, second-consumer example
  `ccc`/`sdlcc` → `ccc`/`jicc`, plus the same ADR 0024 naming note.

Deliberately untouched: present-state descriptions of today's repo (the
ship-objectives Thesis "today" sentence), existing package names (`@sdl/kernel`,
`@sdl/objective`, `@sdl/core`, `@sdl/areg` — the parent's package-scope sweep),
Objective slugs (durable identity), completed `[x]` roadmap rows, immutable
`updates/` files, and the historical Pup report under `references/`.

## Objective Impact

- Second roadmap row (pre-landing coordination) marked complete.
- The risk that a pre-cutover build of `ji init` or the skills surface would mint new
  sdl-named namespace into customer repos is closed off at the spec level.
- Both edits are spec-prose only; no code surface changed, so no validation beyond
  formatting applied.

## Follow-Ups

- Next row: author the cutover workflow script against the ATOMIC list (script
  placement still an open question).
- If either sibling Objective starts implementation before the cutover lands, the
  naming notes are the guard; remove those notes as stale once the cutover completes.
