# Reshaped as a Steelthread Objective

## Summary

The user directed that this record be made as steelthread-shaped as possible, applying the newly documented Steelthread Objective pattern (`skills/objective/references/objective-patterns.md`, added 2026-07-06). The record's scope is now explicitly the thinnest end-to-end slice of the reusable harness-artifact ambition: one real ns-owned skill flowing from a static catalog, through the harness path table and a deterministic provision plan, into the `pi`/`claude-code`/`codex` harness roots via `ns skills list/path/install`, writing an install manifest with per-file content hashes — with zero `npx skills` dependency.

Everything beyond that thread moved from main-line scope to deferred breadth under `## Parked`:

- Extension-carried artifact provisioning (previously pulled forward from parked into `## Work` on 2026-07-02) moved back to parked, together with the `ns update` hook and ambient-drift fingerprint nudges. The reconcile-primitive architecture decision (`updates/20260702T041140Z-reconcile-primitive-and-sdl-update-hook.md`) stands as design orientation: the thread implements install as plan-plus-apply over the first-party catalog and must not preclude reconcile generality, but does not implement it.
- AREG re-platforming and `skills-lock.json`/manifest convergence stay parked; the convergence open question moved out of `## Open Questions` into that parked row.
- The skill-workflow/vocabulary reconciliation sweep (including the bare-"artifact" collision cleanup) moved from `## Work` to parked.
- Thread conflict policy narrowed to LBYL refuse-to-clobber of locally edited files without `--force`; stale-after-upgrade detection, rename cleanup, and uninstall are manifest-enabled parked follow-ups.

Completion criteria were rewritten as a thread-validation gate: the Objective closes when one real skill completes the thread through the real system with tests, and the parked breadth explicitly does not hold the record open. The stale non-goal "no long-lived compatibility alias plan until the package boundary is deliberately chosen" was dropped — the boundary decision landed as `@nseng-ai/harness-artifacts` (see `updates/20260706T100934Z-harness-artifacts-package-seeded-by-areg-pushdown.md`).

## Objective Impact

- `## Work` shrank from five open rows to two: design what the thread needs, then implement and validate the `ns skills` steelthread as the completion gate.
- Two pattern failure modes are now named risks: breadth creep (which had already materialized once via the extension-carried pull-forward) and the cardboard thread (stubbing the manifest, preview, or a harness target would make validation meaningless — the `@nseng-ai/ns-init` `SkillMaterializer` seam is the thread's real consumer).
- The package-boundary risk is partially de-risked by the seeded `@nseng-ai/harness-artifacts` package; residual risk is API shape.
- No edge changes; the `ship-objectives-to-customers` edge annotation remains accurate — the narrowed thread is exactly the surface that Objective consumes.

## Follow-Ups

- When the thread validates and the Closure Gate is evaluated, decide per parked row whether it widens this record's successor or splits into follow-on Objectives (the Steelthread pattern expects the latter for substantial breadth such as AREG re-platforming).
- Historical updates describing extension-carried provisioning as main-line scope (`20260702T041140Z-reconcile-primitive-and-sdl-update-hook.md`) remain accurate as decision records; this update supersedes their scope placement.
