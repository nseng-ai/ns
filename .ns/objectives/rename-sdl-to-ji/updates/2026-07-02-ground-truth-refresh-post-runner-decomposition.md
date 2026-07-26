# Ground-truth refresh: runner decomposition drift, ADR 0024 collision, inventory status

## Summary

The repo moved substantially after this Objective's records were compiled (~93
master commits since 2026-07-01: the flow land/submit domain refactor, the
capability-API rehome, and the Objective Runner begin/finish decomposition). This
refresh reconciles the records with current ground truth. The child
`ji-core-cutover` pipeline absorbed all edit-list drift (see its update
`2026-07-02-objective-runner-drift-absorbed.md`); this entry records the
parent-level consequences.

## Ground-truth changes recorded

- **`cutover-inventory.md` demoted to narrative evidence base.** A snapshot-status
  note now points at the child pipeline (`ji-core-cutover/cutover/`) as the
  operational source of truth for the edit list; the as-compiled counts (~705
  literals, ~154 skill lines) are stale by two absorbed drift waves. The
  "four open design questions" executive-summary line now reflects their
  2026-07-02 resolution.
- **New `SDL_*` surface from the runner decomposition.** `SDL_RUNNER_PI_BIN` and
  the `sdl-objective-runner-` tmpdir prefix joined the brand surface; both are in
  the child's plan. The machine-migration notes now enumerate the full
  shell-profile `SDL_*` env-var list, and the roadmap's machine-migration row
  references it.
- **ADR 0024 numbering collision.** `docs/adr/` now holds both
  `0024-rename-sdl-to-ji.md` and
  `0024-objective-runner-begin-finish-decomposition.md` (duplicate numbers also
  exist at 0016 and 0022). This Objective's records cite the ADR by filename, so
  nothing operative breaks; flagged here per the report-drift rule rather than
  renumbered.
- **`objective-runner` is a new active sibling** whose spec prose uses
  `sdl objective exec runner-*` command names. Its commands are already built and
  swept by the child pipeline; its objective prose lives in the objectives tree,
  which the cutover deliberately does not scrub (records move wholesale via
  `git mv`). No pre-landing coordination needed beyond what the child already
  absorbed — unlike `ship-objectives-to-customers`/`skill-management-subsystem`,
  it scaffolds nothing into new repos.
- **Cross-objective coupling list unchanged in substance:** the three
  name-freezing objectives (`checkout-free-sdl-distribution`,
  `ship-objectives-to-customers`, the retired website Objective) remain open and
  unlanded; the hard-cutover safety assumption (consumer population = this repo +
  owner machines) still holds.
