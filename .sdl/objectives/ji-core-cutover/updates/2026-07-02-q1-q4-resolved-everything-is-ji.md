# Q1–Q4 resolved: everything is ji

## Summary

The owner resolved all four open design questions from
`rename-sdl-to-ji/cutover-inventory.md` with a single ruling: **everything renames to
ji** — no sdl-brand literal survives.

- **Q1:** the package.json `"sdl"` manifest key renames to `"ji"` (including
  `sdl.tier` fields); `discovery.ts`, all manifests, the areg/style-guard readers, and
  the topology-report script change consistently in one ATOMIC commit.
- **Q2:** `sdl.toml` → `ji.toml`; areg staying un-renamed does not exempt its config
  filename. The areg/roaster readers update in the same landing.
- **Q3:** the live "no legacy `~/.sdl/enriched-plan` fallback" prose and its three
  test assertions are rewritten to `~/.ji/…` — the sentence is kept, not generalized
  or retired.
- **Q4:** all small-fry brand literals become ji (aretro tmpdir segment, internal
  event key `"ji:pi-extension-command:finished"`, `.pi/extensions/sdl.ts` →
  `.pi/extensions/ji.ts`). The `src/sdl/` source-layout convention also becomes
  `src/ji/`, but executes in the parent's package-scope sweep row, not this window.
  Inventory ordering otherwise stands (event key may trail POST if deferred).

## Objective Impact

- The gate on the cutover workflow's edit list is lifted: the ATOMIC list can now be
  partitioned into concurrent edit agents without unresolved branching on manifest
  key, config filename, or prose treatment.
- Q1's answer widens the ATOMIC surface slightly (manifest key + readers must land
  consistently in one commit) — already flagged in the inventory's atomicity notes.
- First roadmap row marked complete. The workflow-script-placement question remains
  open and belongs to the workflow-authoring row.
- Decisions recorded in `objective.md` Open Questions and reflected in
  `rename-sdl-to-ji/cutover-inventory.md` per the roadmap row's instruction.

## Follow-Ups

- Correct operative spec text in `ship-objectives-to-customers` and
  `skill-management-subsystem` (next roadmap row).
- Author the cutover workflow script against the now-unblocked ATOMIC list, deciding
  script placement en route.
