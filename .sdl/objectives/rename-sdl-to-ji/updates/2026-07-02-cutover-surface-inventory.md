# Cutover surface inventory completed

## Summary

Ran a five-way parallel repo sweep (bin, `.sdl/` paths, `/sdl:*` Pi namespace, XDG
namespaces, cross-surface coupling) and consolidated the results into
`cutover-inventory.md` alongside this objective — the planning artifact for the core
cutover landing window. Headline findings: ~705 in-scope `.sdl` literals, ~154
`sdl <command>` skill instruction lines, no single source of truth on any surface except
the XDG helper (which itself has three bypass sites, worst being the `isManagedSlotPath()`
regex in `flow/src/land/stack/worktrees.ts`); one hard build-breaker (the pnpm workspace
glob `../.sdl/reviews/*/tools/*` wired into `pnpm-workspace.yaml`/`package.json`/
`tsconfig.json`/lockfile); several silent-failure traps (kernel extension-discovery root,
duplicate un-imported literals for `"sdl:flow:land"` and the PR-description prompt path,
style-guard path bucket); and tests that read the real checked-in `.sdl/extensions/`
directory and hard-crash on a split landing. Machine migration is confirmed to be pure
directory moves plus `git worktree move` repair — no registries or databases exist.

## Objective Impact

- The core-cutover roadmap row now has a concrete execution basis: the inventory's
  PRE / ATOMIC / POST ordering replaces guesswork about what must land together.
- Split-landing risk is now enumerated site-by-site rather than stated abstractly; the
  onboarding-chain (AGENTS.md → bin → registry → discovery → storage constants) is traced
  link-by-link.
- Four open design questions surfaced that should be answered before the landing window
  (recorded in the inventory): Q1 whether the package.json `"sdl"` manifest key renames;
  Q2 whether `sdl.toml` renames given areg stays; Q3 what happens to live
  "no legacy `~/.sdl/…` fallback" prose/assertions; Q4 small-fry brand literals
  (aretro tmpdir, internal event key, `.pi/extensions/sdl.ts`, `src/sdl/` layout dirs).
- New cross-objective coupling found beyond the known parity-table case:
  `ship-objectives-to-customers`'s unimplemented `sdl init` spec would scaffold the old
  namespace into customer repos — its spec text must be corrected before that feature is
  built.

## Follow-Ups

- Answer Q1–Q4 (owner/design decisions) before opening the landing window.
- Land the current decision-records stack to master so the cutover stack starts shallow
  (the objective's own open question about the landing window).
- Owner: create the `ji` npm org (unchanged, still pending).
- Next semantic slice: author the mechanical cutover change itself against the ATOMIC
  list in `cutover-inventory.md`.
