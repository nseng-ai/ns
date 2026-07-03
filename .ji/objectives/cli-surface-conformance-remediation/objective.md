# Apply sdl-cli-design standards across the CLI surface

## Thesis

The `sdl-cli-design` standard (skill + ADRs 0010–0015) exists, and framework-enforced Clinkr gates are intended to be conformant by construction. The still-open work is the command-local discipline the framework does not fully enforce: danger-tier confirmation, output-volume bounding, stable `errorType`/structured failure data, and correct `negative(...)`/`ok(...)`/`usageError`/`failure(...)` semantics.

This Objective was seeded from the point-in-time audit in `docs/cli-surface-conformance-audit.md`. That audit remains the historical matrix and starting checklist, but intervening package moves and command-surface refactors mean its file:line locators and some classifications must be re-verified against current source before implementation. The Objective should drive the matrix to ground by landing high-confidence remediations, explicitly parking contested or large items, and updating durable evidence when current code has diverged from the audit.

The four command-local areas remain:

- **(a) Danger-tier classification** (ADR 0014/0015) — tiers 0–3; `--yes`/`-y` (Tier 2 confirm) vs `--force`/`-f` (Tier 3 override); prompts must gate on `ClinkrInteraction.isInteractive()` or equivalent current Clinkr context and fail fast non-interactively with a flag-naming `usageError`.
- **(b) Output-volume bounding** (ADR 0012) — large results expose completion state, applied bound, and continuation/narrowing guidance in the result schema.
- **(c) `errorType` discipline** (ADR 0010) — stable snake_case `errorType` plus structured, agent-actionable `data` where recovery benefits.
- **(d) Exit semantics** (ADR 0013) — `negative` for real non-success; `ok` for harmless empty success or predicate misses; `usageError` for bad/missing args; `failure` for operational errors.

## Scope

- The CLI packages and command leaves enumerated by `docs/cli-surface-conformance-audit.md`, re-mapped to current tracked package locations before editing. Verified current package names/locations include `@sdl/areg` under `ts/packages/tools/areg`, `@sdl/brmem` under `ts/packages/infra/brmem`, `@sdl/packagechk` under `ts/packages/tools/packagechk`, `@sdl/slot` under `ts/packages/capabilities/slot`, `@sdl/kernel` under `ts/packages/kernel`, `@sdl/address` replacing the former PR Address package, and `sdlcc` under `ts/packages/hosts/sdlcc`.
- Resolving and preserving the ADR 0015 decisions that gate remediation, especially raw-exit policy, hidden `exec` write intent, miss semantics, and dotfile/user-environment danger tiers.
- Landing high-confidence human-facing danger-tier fixes with scenario tests, using conformant references such as `handoff delete`/`gc`, `slot gc`, and `brmem put` as templates, while preserving ADR 0015's hidden-`exec` no-prompt carve-out.
- Safety-first sequencing: area (a) danger tiers, then (d) exit semantics, then (c) `errorType`, then (b) output bounding; rebaseline individual rows when current code has already changed.

## Non-Goals

- Structural / DRY cleanup of CLI packages; that belongs to `ts-cli-core-structural-cleanup` or the extension-architecture work.
- New Clinkr framework primitives, pagination frameworks, typed confirmation abstractions, or conformance lint tooling unless a separate design explicitly accepts them.
- Re-auditing framework-enforced gates as a standalone project (`-h`, `--version`, `--runtime`, envelope shape, `--json-schema`, hidden `exec` mechanics). Spot-check them only when a command-local row depends on them.
- The `ccc land`/`land-stack` Pi slash-command surface; ADR 0015 records its single-PR auto-merge decision separately from this Clinkr command-local work.
- Perfecting every command. Contested or large items may be parked with rationale.

## Completion Criteria

- The historical conformance matrix is reconciled with current source: every surviving row in `docs/cli-surface-conformance-audit.md` is either landed, corrected, narrowed, or explicitly parked with current-path/current-symbol evidence.
- ADR 0015 decisions remain the accepted basis for dependent rows; hidden `exec` destructive/external writes stay prompt-free unless a future ADR reverses that policy.
- Human-facing area (a) danger-tier gaps are remediated or reclassified with scenario tests covering interactive confirm, `--yes`/`--force` bypass as applicable, and non-interactive flag-naming `usageError`.
- Area (d) and area (c) fixes are applied or parked across the currently verified command set; generic error-collapse wrappers such as `branch-context`/`plans` are replaced only with modeled snake_case errors and useful structured data.
- Area (b) large-output rows are re-verified against current schemas first, then bounded or parked. Aretro in particular now has `maxSessions` and payload-mode support, so its original audit classification must be rechecked rather than blindly applied.
- Every remaining gap from the matrix is either landed or explicitly parked; no row is silently dropped because a package moved or a command was remounted.
- Evidence: targeted scenario/unit tests and relevant per-package `just` validation pass for each touched package; broaden validation when shared wrappers or mounted SDL command faces move.

## Assumptions and Risks

Assumptions:

- Framework gates remain conformant by construction via `@sdl/core/cli-entry` / current Clinkr command registration; this Objective focuses on command-local authoring discipline.
- The conformant reference commands are still valid templates, but their current paths should be re-checked before copying patterns.
- ADR 0015 remains Accepted and continues to resolve the six original design questions.

Risks:

- **Evidence drift:** the audit's file:line references are historical. Current source has moved across `tools/`, `infra/`, `capabilities/`, `hosts/`, and renamed PR Address to Address; each remediation must verify current files and symbols before editing.
- **Intervening remediation or refactor:** CLI house-style, extension command faces, or package migrations may have already fixed or changed individual rows. Treat the audit as a checklist to reconcile, not as fresh truth.
- **Cross-cutting blast radius:** replacing shared wrappers or changing mounted command faces can affect multiple packages and requires broader validation than a single leaf command.
- **Contested tier judgments:** `brmem delete`, `vibechk run`, and user-environment writes may still attract review debate; use ADR 0015 and current command behavior as the tie-breaker, or park with rationale.

## Open Questions

- Resolved by final reconciliation: later CLI house-style and extension-architecture work were accounted for row-by-row as remediation slices landed; no known non-parked implementation gap remains.
- Resolved: Aretro needed explicit `outputBounds` / `valueBounds` metadata beyond its earlier `maxSessions` and payload-mode shape; that remediation is landed.
- Resolved: raw-exit migrations stayed within this Objective except `vibechk run`, which is intentionally parked as an ADR 0015 process-control/runner passthrough.

## Closure

Closed after the final current-source reconciliation pass. The historical audit matrix remains in `docs/cli-surface-conformance-audit.md` as point-in-time evidence with a current-status banner. The Objective's tracked remediation slices landed or parked every surviving row: Area (a) danger-tier fixes, Area (d) exit-semantics migrations, Area (c) kebab-case and modeled error-type discipline including Branch Context / Plans, and Area (b) output-bound remediation for Aretro/Vibechk with Roaster review-log parking below the ADR 0012 threshold.

Final source probes found no uncommitted changes and no known non-parked implementation gap. Remaining parked items are intentionally out of this Objective's completion path: domain-small unbounded lists below the ADR 0012 threshold, the non-Clinkr `ccc land`/`land-stack` Pi surface, new conformance tooling, and structural/DRY cleanup owned by other work.
