# TS CLI + @sdl/core Structural Cleanup

## Thesis

A thermo-nuclear code-quality review of the TypeScript CLI fleet (15 CLIs at review time; 11 `cli.ts` entrypoints at HEAD after package consolidation and capability migration) plus the shared `@sdl/core` package found that the fleet's foundations are strong (no `as unknown as`, no broad `any`, errors-as-values throughout, gateway seams, and Zod at most boundaries) but that the same handful of concepts are reimplemented across packages instead of living once in the appropriate shared layer, and that several files/functions have crossed the size/cohesion line. This Objective tracks landing those findings as independently reviewable structural changes where they remain valid.

The full original review — with file evidence, severity, and concrete remedies for every finding — is preserved under `references/` (start at `references/README.md`). Because the workspace has since been rehomed and the extension architecture migration has moved several ownership boundaries, the reference files are source material rather than current truth: always re-verify paths, package homes, and ownership before picking up an open row.

**Repository-layout note (rebaselined at HEAD).** The package scope is `@sdl/*` (no live `@asdl/*` imports under `ts/`). Current package homes relevant to this Objective include `@sdl/core` → `ts/packages/infra/core/`, `@sdl/brmem` → `ts/packages/infra/brmem/`, `@sdl/graphite` → `ts/packages/infra/graphite/`, `@sdl/kernel` → `ts/packages/kernel/`, `@sdl/areg` → `ts/packages/tools/areg/`, `@sdl/packagechk` → `ts/packages/tools/packagechk/`, `@sdl/vibechk` → `ts/packages/tools/vibechk/`, `sdlcc` → `ts/packages/hosts/sdlcc/`, `@sdl/pi` → `ts/packages/hosts/pi/`, `sdl-flow` → `ts/packages/capabilities/flow/`, and `@sdl/slot` → `ts/packages/capabilities/slot/`. `@sdl/ccc`, `@sdl/aretro`, `@sdl/address`, `@sdl/roaster`, `@sdl/branch-context`, `@sdl/handoff`, `@sdl/objective`, and `@sdl/plans` remain top-level under `ts/packages/`.

This Objective is the canonical home for tactical TypeScript structural cleanup and architecture-deepening findings that are *not* specifically extension-layering endgame work. It subsumes the still-live tactical rows from the closed `ts-cli-architecture-deepening` Objective. Architectural layering and capability-extension migration work routes to `sdl-extension-architecture` (ADR 0009). **Sequencing update:** remaining unstarted cleanup/deepening work is still paused behind the active `sdl-extension-architecture` endgame. That endgame has advanced substantially (`@sdl/capability-kit`, `sdl-sdk`, `@sdl/domain-primitives-transitional`, `sdl-flow`, and several capability child migrations exist), but the parent remains open because remaining capability migrations, broader `ccc` clean-consumer work, and deletion of `@sdl/domain-primitives-transitional` are incomplete. Resume this Objective only after a fresh classification of each open row as neutral structural cleanup, capability-owned migration work, or obsolete debt.

## Scope

In scope — the verified or still-open review findings, grouped:

- **Shared CLI wiring layer (completed):** `defineCli` in `@sdl/core/cli-entry` owns `runtimeInfo` derivation, version reading, IO/cwd/env defaulting, and the `import.meta.main` entry guard for the current `cli.ts` entrypoints. The previously proposed `clinkr` `execGroup(description?)` factory is rejected: the existing hidden-`exec` construction was already correct everywhere, and the helper did not delete enough complexity to justify a shared abstraction.
- **Branch-Memory access unification (mostly completed):** `branch-context` now uses the in-process `@sdl/brmem` `BrmemGateway`; its old `src/brmem-gateway.ts` JSON/subprocess parser is gone. `@sdl/core/brmem-cli` now exposes a single public `runBrmem` runner while preserving the two-candidate behavior (PATH `brmem`, then `pnpm exec brmem` fallback) internally; the former public candidate-iteration surface and dead `readOptionalBrmemBooleanField`/`graphqlErrorsFromJson` exports are gone. `brmem` composes core `GitGateway` for generic Git branch facts while keeping Branch Memory ref-encoding checks local.
- **Cross-package dedup (open, re-verify first):** one `resolveBranchOrCurrent` helper was proposed but still does not exist; branch-name validation now has a deliberate split between core Git ref validation and brmem Snapshot Ref encoding validation, so remaining dedup should be re-counted before implementation. GitHub PR feedback leaf helpers still have duplication/drift: core `github-pr-feedback` owns `ghAuthorSchema` and private `normalizeAuthor`/`numericGithubIdentity` helpers, while `roaster` still carries divergent copies. The vestigial `@sdl/core` root `.` export remains, with a live bare importer in `ts/packages/hosts/pi/src/sessions/harness-session.ts`.
- **God-file / god-function decomposition (open, ownership shifted):** `@sdl/areg` still has `ts/packages/tools/areg/src/real-gateways.ts` (1383 lines) with multiple gateways plus filesystem/toolkit concerns. The land-stack implementation moved into `sdl-flow`; `ts/packages/ccc/src/land-stack/landing-operations.ts` is now a 14-line re-export, while `ts/packages/capabilities/flow/src/land-stack/landing-operations.ts` is 1222 lines and still contains `performGraphiteMaintenance`. Any further land-stack decomposition must respect the current Flow capability ownership and ADR 0009 layering.
- **Graphite / ccc boundary convergence (open, ownership shifted):** Graphite topology reads now live in the Flow land-stack implementation (`graphite-topology.ts` and `stack-facts.ts`) with `@sdl/ccc` as a compatibility consumer. The canonical home may be `@sdl/graphite` for neutral mechanics or `sdl-flow` for Flow policy; confirm at pickup rather than assuming the original `@sdl/core/graphite-metadata` target.
- **Boundary / Zod / type-contract cleanups (open, rehome-aware):** `sdlcc/stack-map-model-loader.ts`; `@sdl/aretro`'s `sessions/pi-jsonl-source.ts`; `@sdl/kernel`'s `extension-discovery.ts`; `@sdl/packagechk`'s `claim-command.ts`; `@sdl/vibechk`'s `workflow.ts`; and Flow-owned submit/PR-description code remain candidates, but each must be checked against current package ownership before implementation.
- **Small dedup / absorbed architecture-deepening rows (open, re-verify first):** ccc/flow small helper dedup, slot-dispatch, slot inventory reconciliation, slot Graphite navigation, objective-markdown validation, Branch Memory entry-locator, and branch-context plan-attachment seams remain as design candidates subject to the blocked sequencing note.

## Non-Goals

- No behavior changes. Every item must preserve observable CLI behavior; this is a structural/quality Objective, not a feature or bugfix Objective.
- Not a VCS/commit/stack-packaging review — out of scope by construction.
- Do not collapse genuinely distinct gateway *interfaces* (for example roaster's REST PR-files surface vs core's GraphQL feedback gateway, or areg's domain-scoped project gateway). Only shared *leaf helpers*, mechanics, and policy are candidates for unification.
- Do not force `objective` filesystem records onto the Branch-Memory ref gateway; its storage model is legitimately different.
- Do not parallelize intentionally sequential flows such as land-stack merge/ref cleanup or gh rate-limited submit loops; those orderings are correctness constraints.
- Do not touch vendored third-party code under `.agents/skills/`.
- **ADR 0009 layering guardrail.** Do not move duplicated capability-domain logic into below-SDK neutral packages merely because it is duplicated. Before pulling shared code "down," classify it against ADR 0009 layering: neutral infra lives below the SDK (`@sdl/core`, `@sdl/clinkr`, `@sdl/graphite`, `@sdl/brmem`), above-SDK capability substrate lives in `@sdl/capability-kit`, capability domain lives in its capability package / Capability API, and temporary SDK-independent primitives live in `@sdl/domain-primitives-transitional` until deleted. Deduping a leaf helper or policy is in scope; relocating capability-domain logic below the SDK to remove duplication is not.

## Completion Criteria

- The shared `defineCli` helper exists and all current CLIs consume it; `runtimeInfo`/version/entry-footer boilerplate is gone from individual `cli.ts` files. The `execGroup(description?)` helper is explicitly not a completion requirement after review rejected it as an underpowered shared abstraction.
- `branch-context` reads/writes Branch Memory through the in-process gateway; the parsing half of its old `brmem-gateway.ts` and its `@sdl/core/brmem-cli` dependency are deleted; the brmem-cli candidate framework is collapsed behind `runBrmem` while preserving fallback behavior.
- The remaining named cross-package duplications are either unified to a single canonical implementation or explicitly reclassified as no-longer-valid because current extension/capability ownership makes the original target wrong.
- `@sdl/areg`'s `real-gateways.ts`, Flow/ccc land-stack maintenance logic, and any still-live god-files/functions are decomposed below the cohesion line with message/presentation separated from mutation/business logic where applicable.
- The per-package boundary/Zod/type cleanups are either landed in their current package homes or intentionally moved to the owning extension/capability Objective.
- Evidence: the relevant TypeScript gates pass for each landed slice, and behavior parity is confirmed by existing or focused CLI scenario tests for affected commands.

## Assumptions and Risks

Assumptions:

- The original review findings are useful source material but not current truth. Current code must be re-probed before carrying forward counts, paths, package names, or ownership claims.
- The remaining open work should not be decomposed or picked up independently until `sdl-extension-architecture` advances far enough for a row-by-row reclassification. Some rows are pure neutral cleanup; several are architecture-sensitive and may be invalidated, moved, or reframed by capability-extension migration.
- The CLI scenario tests plus the normal TypeScript gates are a sufficient behavior-parity net for refactors of this shape when paired with focused tests around the moved seam.
- The original `execGroup(description?)` recommendation over-weighted repeated syntax and under-weighted abstraction cost. Future shared-helper rows should clear a stronger bar: delete meaningful complexity, prevent plausible drift, or encode a non-obvious invariant.

Risks:

- **Highest-risk item:** land-stack Graphite maintenance still mutates local Graphite refs after irreversible merges. The implementation now lives in `sdl-flow`, but the risk remains: preserve the expected-SHA snapshot and merge→verify→cleanup ordering exactly, and land test coverage before refactor.
- Branch-Memory cleanup has a compatibility hazard around ref encoding and fallback behavior. The already-landed `runBrmem` simplification deliberately preserved the PATH→`pnpm exec brmem` fallback; future entry-locator or plan-attachment work must be compatible/append-only and covered with its own tests before migrating callers.
- A shared CLI entrypoint helper touches every CLI at once; future changes to `defineCli` must keep scenario coverage for `--version`, `--runtime`, and help/entry behavior.

## Open Questions

- For the two `legacyCommand`-based CLIs (`plans`, `branch-context`), is migrating off the deprecated path in scope here or a separate Objective?
- After `sdl-extension-architecture` finishes enough of the remaining capability migration and `ccc` clean-consumer work, which open rows stay in this Objective as neutral cleanup, and which should move to capability-owned Objective records?
