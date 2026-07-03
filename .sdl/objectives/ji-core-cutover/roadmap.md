# Roadmap

## Work

- [x] Resolve Q1–Q4 with the owner and record the decisions here and in
      `rename-sdl-to-ji/cutover-inventory.md` — they gate the workflow's edit list.
      Evidence: owner decision 2026-07-02 — everything renames to ji (manifest key
      `"ji"`, `ji.toml`, legacy-fallback prose rewritten to `~/.ji/…`, all small-fry
      literals; `src/sdl/` → `src/ji/` delegated to the parent's package-scope sweep).
      Recorded in `objective.md` Open Questions and the cutover inventory; see update
      `2026-07-02-q1-q4-resolved-everything-is-ji.md`. The workflow-script-placement
      question remains open on the workflow-authoring row.
- [x] Correct operative spec text in `ship-objectives-to-customers` (unbuilt `sdl init`
      scaffolding) and `skill-management-subsystem` (`sdl skills` surface design) so no
      new sdl-named surface gets built pre-cutover.
      Evidence: both Objectives' `objective.md`/`roadmap.md` now spec ji-named surfaces
      (`ji init`, `ji skills`, `@ji/init`, `.ji/objectives/`, `ji.toml`,
      `ji:objectives:*`, `ccc`/`jicc`) with an ADR 0024 naming note in each;
      present-state descriptions, existing package names, Objective slugs, and
      immutable updates left for the parent's sweeps. See update
      `2026-07-02-sibling-specs-corrected-to-ji.md`.
- [ ] Author the cutover workflow script (Claude Workflow tool): partition the ATOMIC
      list from `cutover-inventory.md` into disjoint concurrent edit agents, add an
      adversarial verify stage targeting the named silent-failure traps, and emit a
      structured report; decide script placement (session one-shot vs
      `.claude/workflows/`, per the open question).
      The in-repo `refactor-swarm-workflow` skill is the candidate starting pattern.
- [ ] Re-verify `cutover-inventory.md` against the repo when the landing window opens
      (drift check since the 2026-07-02 snapshot); fold any new sites into the
      workflow's work-list.
- [ ] Execute the landing in one window on a dedicated branch: `git mv .sdl .ji`, run
      the workflow over the ATOMIC list, `pnpm install` to regenerate lockfile/shims,
      and update the `cross-harness-parity` parity table in the same landing.
      Evidence: `just` passes; `ji objective list` and `ji objective exec
      load-orientations` work; no compat codepath introduced; every ATOMIC item
      addressed or explicitly re-bucketed.
- [ ] Record landing evidence in the parent `rename-sdl-to-ji` (its cutover row
      completes against this Objective) and hand remaining rename work (machine
      migration, sweeps, repo rename) back to the parent.

## Parked

- Generalizing the cutover workflow into a reusable platform capability — only if the
  script proves reusable beyond this landing; needs an explicit promotion path per
  `docs/platform-and-consumer.md`.
