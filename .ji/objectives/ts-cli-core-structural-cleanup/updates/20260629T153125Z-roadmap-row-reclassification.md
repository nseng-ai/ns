# Roadmap Row Reclassification

## Summary

Performed the requested row-by-row reclassification pass for the remaining `ts-cli-core-structural-cleanup` backlog against current code, active Objective records, and ADR 0009/0012/0016 layering rules.

Current evidence checked during the pass included:

- `sdl objective exec tracking-gate ts-cli-core-structural-cleanup --format json` on branch `objective-roadmap-row-reclassification`; the gate reported no uncommitted changes and no material non-Objective branch diff paths.
- Active orientation output, especially `sdl-extension-architecture` and this Objective's own orientation.
- ADR 0009/0012/0016, confirming neutral infra below SDK, capability domain above SDK, standalone tools off the extension axis, and GitHub real protocol mechanics versus capability seams.
- Current code probes for: `resolveBranchOrCurrent`; bare `@sdl/core` imports; `ghAuthorSchema`/`normalizeAuthor`/numeric GitHub identity helpers; Flow/ccc land-stack files; `@sdl/domain-primitives-transitional`; `legacyCommand`; Slot/Objectives/brmem/branch-context absorbed rows; and selected per-package cleanup symbols.

Classification results:

- **Neutral structural cleanup candidates:** `@sdl/core` root export deletion, GitHub PR feedback leaf-helper sharing, `@sdl/areg` real-gateway decomposition, `sdlcc` Zod boundary cleanup, `@sdl/kernel` extension-discovery schema cleanup, `@sdl/packagechk` claim-command simplification, and `@sdl/vibechk` workflow cleanup.
- **Capability-owned / extension-boundary rows:** Flow land-stack decomposition, Flow submit/PR-description tidy-ups, Aretro JSONL evidence cleanup, Objective markdown validator deepening, Branch Context/Plans plan-attachment seam, slot/ccc dispatch boundary, and ccc/flow small dedup unless a future pickup proves a policy-free leaf helper.
- **Split or design-sensitive rows:** Graphite topology ownership remains split: policy-free mechanics may belong in `@sdl/graphite`, while landing-path behavior stays Flow-owned.
- **Obsolete / disposed rows:** `resolveBranchOrCurrent` as originally framed, Slot inventory leakage, Slot Graphite navigator row, Branch Memory entry-locator row, and the parked `legacyCommand` migration.

## Objective Impact

Updated `roadmap.md` to replace the blanket blocked note with a current reclassification note, add a `Classification:` disposition and evidence to every previously open row, and mark obsolete/disposed rows as historical non-candidates.

Updated `objective.md` and `orientation.md` so future cold agents do not treat the entire Objective as paused behind extension architecture. The durable rule is now: implement only rows marked neutral structural cleanup in this Objective after a narrow pickup re-check; route capability-owned rows to the owning capability context; treat disposed rows as provenance.

The likely first safe future implementation candidate is **delete the vestigial `@sdl/core` root `.` export**: current evidence shows `ts/packages/infra/core/package.json` still exports `"."`, and the only live source bare importer found is `ts/packages/hosts/pi/src/sessions/harness-session.ts`; style-guard fixture expectations need deliberate adjustment.

## Follow-Ups

- For the next neutral implementation slice, prefer the `@sdl/core` root-export deletion unless the user chooses a larger cleanup; validate exact source importers and style-guard fixtures at pickup.
- Treat GitHub helper sharing as a narrow ADR 0016-safe slice: only policy-free leaf normalization/identity mechanics may move/share from `@sdl/core/github-pr-feedback`; roaster policy stays in roaster.
- Treat Flow land-stack and submit cleanup as Flow capability maintenance. Preserve expected-SHA and merge→verify→cleanup ordering if decomposing land-stack code.
- Treat `@sdl/areg`, `@sdl/packagechk`, and `@sdl/vibechk` as standalone tool-local cleanups off the extension axis.
- Do not resurrect the disposed `resolveBranchOrCurrent`, Slot inventory, Slot navigator, brmem entry-locator, or legacyCommand rows without fresh code evidence.
