# TS CLI + asdl-core Structural Cleanup

## Thesis

A thermo-nuclear code-quality review of the TypeScript CLI fleet (15 CLIs at
review time; 14 `cli.ts` entrypoints at HEAD after `slot` folded into `sdl slot`
and Pi was consolidated) plus the shared `@sdl/core` package found that the
fleet's foundations are strong (no
`as unknown as`, no `any`, errors-as-values throughout, gateway seams, Zod at
most boundaries) but that the same handful of concepts are reimplemented 3–15
times across packages instead of living once in the shared layer, and that three
files/functions have crossed the size/cohesion line. Almost every high-leverage
fix is a cross-package "code judo" move that *deletes* code by pulling repeated
concepts down into `@sdl/core` / `clinkr`, or that decomposes a god-file. This
Objective tracks landing all of those findings as independently reviewable
changes.

The full review — with file:line evidence, severity, and concrete remedies for
every finding — is preserved under `references/` (start at `references/README.md`).
Scope and roadmap below summarize it; the reference files are the source of truth
for implementation detail.

**Repository-layout note (rebaselined at HEAD).** Since the review was captured the
`ts/` workspace was rehomed into `hosts/`, `infra/`, `capabilities/`, and `tools/`
buckets, and the package scope is `@sdl/*` (the earlier `@asdl/*` scope is gone).
Where this record names a short package-relative path (for example
`areg/real-gateways.ts`), the current on-disk home is: `@sdl/core` →
`ts/packages/infra/core/`, `@sdl/brmem` → `ts/packages/infra/brmem/`, `@sdl/graphite`
→ `ts/packages/infra/graphite/`, `areg` → `ts/packages/tools/areg/`, `packagechk` →
`ts/packages/tools/packagechk/`, `vibechk` → `ts/packages/tools/vibechk/`, `sdlcc` →
`ts/packages/hosts/sdlcc/`, Pi → `ts/packages/hosts/pi/`; `ccc`, `aretro`, `sdl`,
`roaster`, `branch-context`, `handoff`, `objective`, `plans`, and `pr-address` remain
top-level under `ts/packages/`.

This Objective is now the canonical home for tactical TypeScript structural
cleanup and architecture-deepening findings that are *not* specifically
extension-layering endgame work. It subsumes the still-live tactical rows from
the closed `ts-cli-architecture-deepening` Objective (whose
`improve-codebase-architecture` deepening pass surfaced shallow modules, leaky
seams, and one-adapter watch-points across the TypeScript CLIs and `asdl-core`).
Architectural layering and capability-extension migration work routes to
`sdl-extension-architecture` (ADR 0009); general TS cleanup/deepening routes
here. **Sequencing update:** remaining unstarted cleanup/deepening work is paused
behind the active `sdl-extension-architecture` endgame. Resume this Objective only
after the extension architecture foundation has landed enough to rebaseline which
rows remain neutral structural cleanup versus capability-extension migration work.
Migrated deepening rows keep the deletion-test / module-interface-depth-seam
vocabulary they were captured in — the reasoning is carried across intact, not
flattened into bare findings.

## Scope

In scope — the verified review findings, grouped:

- **Shared CLI wiring layer (holistic):** a `defineCli` helper in
  `@sdl/core/cli-entry` owning `runtimeInfo` derivation, version reading,
  IO/cwd/env defaulting, and the `import.meta.main` entry guard (collapses ~150
  lines of boilerplate copy-pasted across the per-CLI `cli.ts` entrypoints and kills the
  stale-version and runtimeInfo-desync latent drift bugs). The previously
  proposed `clinkr` `execGroup(description?)` factory is rejected: the existing
  hidden-`exec` construction was already correct everywhere, and the helper was
  a thin wrapper that did not delete enough complexity to justify a shared
  abstraction.
- **Branch-Memory access unification:** point `branch-context` at the in-process
  `@sdl/brmem` `BrmemGateway` (as `handoff` already does) instead of shelling
  out to the `brmem` CLI + re-parsing JSON; collapse the
  `@sdl/core/brmem-cli` multi-candidate framework (which always returns one
  hardcoded candidate) to a single `runBrmem`; have `brmem`'s
  `real-git-gateway.ts` compose the core `GitGateway` for generic facts rather
  than re-deriving `runGit`/`currentBranch`/branch-validation.
- **Cross-package dedup:** one `resolveBranchOrCurrent` helper (4 copies today);
  one canonical branch-name validator (3 divergent rule-sets today); export
  `ghAuthorSchema`/`normalizeAuthor`/`numericGithubIdentity` from the
  `github-pr-feedback` barrel and delete roaster's divergent copies; delete the
  vestigial `@sdl/core` root `.` export; delete confirmed-dead exports
  (`graphqlErrorsFromJson`, `readOptionalBrmemBooleanField`).
- **God-file / god-function decomposition:** split `areg/real-gateways.ts`
  (1383 lines at HEAD, 6 unrelated gateways + a 600-line FS toolkit) per-gateway
  and collapse the `init`/`skill-kind` policy fork to a data descriptor; share a
  pure `classifySkillSpecResolution` so the areg fake stops reimplementing
  resolution policy; decompose `ccc` `performGraphiteMaintenance` (a god-function
  over post-merge ref mutation, in `ccc/src/land-stack/landing-operations.ts`) per
  phase and split `landing-operations.ts` (1052 lines at HEAD), moving
  message-English to `presentation.ts`.
- **ccc boundary convergence:** one shared `loadGraphiteTopology` (two divergent
  read paths today: `ccc/src/land-stack/graphite-topology.ts` and `stack-facts.ts`);
  confirm its canonical home at pickup — the original review targeted
  `@sdl/core/graphite-metadata`, but the newer `@sdl/graphite` infra package may now
  be the right owner. Route `land-stack` git facts through `RealGitGateway` and
  GitHub access through `@sdl/core/github-cli` (the same package already does this in
  `worktree-status`).
- **Boundary / Zod / type-contract cleanups (per package):**
  `sdlcc/stack-map-model-loader.ts` hand-rolled validation tower → Zod, plus
  delete the parsed-but-unread `edges`/`surfaceType`/`tty`;
  `aretro/pi-jsonl-source.ts` split generic accessors out and unify the two
  `bashExecution` count paths; `sdl/extension-discovery.ts` replace the
  reflective `MANIFEST_COMMAND_FIELDS` engine with a Zod schema and de-dup the
  `index.ts`/`index.js` block; `packagechk/claim-command.ts` collapse the
  `ClaimPolicy`/`ClaimPlan` abstraction (N=2) to two linear functions;
  `vibechk/workflow.ts:executeRun` mutable-`let`/dual-try-catch refactor plus
  the dead-type-debris cleanups (`GitProvenance` dup, dead
  `artifacts`/`transcript`, redundant cast, `normalizeRunsFormatArgs`).
- **asdl-core `submit/` tidy-ups:** collapse the prewrite vs post-submit
  PR-description duplication and the third `reconcilePrewrittenPr` path; extract
  the 3× failure-transcript spread; resolve the two same-named
  `formatOutputSection` implementations; prune `submit/index.ts`'s ~20
  no-consumer re-exports; delete the alias-only `submit/result.ts`.
- **ccc small dedup:** `firstNonEmptyLine` (2×), `isRecord` (3×, canonical in
  `pi-extension-runtime`), inlined `gt restack`/`submit` arg vectors, and
  presenting `presentLandStackFailure` once instead of at 15 early-return sites.

## Non-Goals

- No behavior changes. Every item must preserve observable CLI behavior; this is
  a structural/quality Objective, not a feature or bugfix Objective.
- Not a VCS/commit/stack-packaging review — out of scope by construction.
- Do not collapse genuinely-distinct gateway *interfaces* (roaster's REST
  PR-files surface vs core's GraphQL feedback gateway; areg's domain-scoped
  project gateway). Only shared *leaf helpers* and *policy* are unified.
- Do not force `objective` (filesystem records) onto the Branch-Memory ref
  gateway — its storage model is legitimately different.
- Do not "parallelize" the intentionally-sequential flows (land-stack merge loop
  ordering, gh rate-limited submit loops) — those are correctness constraints.
- Do not touch vendored third-party code under `.agents/skills/`.
- **ADR 0009 layering guardrail.** Do not move duplicated capability-domain logic
  into below-SDK neutral packages merely because it is duplicated. Before pulling
  shared code "down," classify it against ADR 0009 layering: neutral infra lives
  below the SDK (`@sdl/core`, `@sdl/clinkr`, `@sdl/graphite`, `@sdl/brmem`),
  above-SDK extension substrate lives in `@sdl/capability-kit` (renamed from
  `@sdl/extension-kit`), capability domain
  lives in its capability package / Peer API, and a temporary SDK-independent
  primitive lives in `@sdl/domain-primitives-transitional`. Deduping a leaf helper
  or policy is in scope; relocating capability-domain logic below the SDK to remove
  duplication is not — that is `sdl-extension-architecture`'s migration work.

## Completion Criteria

- The shared `defineCli` helper exists and all CLIs consume it;
  `runtimeInfo`/version/entry-footer boilerplate is gone from individual
  `cli.ts` files. The `execGroup(description?)` helper is explicitly not a
  completion requirement after review rejected it as an underpowered shared
  abstraction.
- `branch-context` reads/writes Branch Memory through the in-process gateway; the
  parsing half of its `brmem-gateway.ts` and its `@sdl/core/brmem-cli`
  dependency are deleted; the brmem-cli candidate framework is collapsed.
- `areg/real-gateways.ts`, `ccc/land-stack/landing-operations.ts`, and
  `ccc performGraphiteMaintenance` are decomposed below the cohesion line, with
  message-formatting separated from ref-mutation/business logic.
- The named cross-package duplications are unified to a single canonical
  implementation each (branch resolution, branch-name validation, GitHub leaf
  helpers, Graphite topology read, dead-export removal).
- The per-package boundary/Zod/type cleanups (sdlcc, aretro, sdl, packagechk,
  vibechk, asdl-core submit) are landed.
- Evidence: `just` (TS lint/format/typecheck/test via tsgo + Vitest) passes for
  each landed slice, and behavior parity is confirmed by the existing CLI
  scenario tests for the affected commands.

## Assumptions and Risks

Assumptions:

- The review findings are accurate as captured; the load-bearing cross-cutting
  claims were independently verified during the review (14/15 CLIs hardcode
  `VERSION`, 14 share the `runtimeInfo` string and entry footer;
  `resolveBrmemCommandCandidates` returns one hardcoded candidate;
  `branch-context` shells out while `handoff` uses the gateway; the `.` export
  has one bare importer; `graphqlErrorsFromJson`/`readOptionalBrmemBooleanField`
  are dead; `areg/real-gateways.ts` holds 6 gateway classes).
- Revised sequencing: the remaining open work should not be decomposed or picked
  up independently until `sdl-extension-architecture` advances the ADR 0009
  endgame far enough for a fresh rebaseline. Some rows are pure neutral cleanup,
  but several are architecture-sensitive and could be invalidated, moved, or
  reframed by capability-extension migration.
- The CLI scenario tests plus `just` are a sufficient behavior-parity net for
  refactors of this shape.
- The original `execGroup(description?)` recommendation over-weighted repeated
  syntax and under-weighted abstraction cost. Future shared-helper rows should
  clear a stronger bar: delete meaningful complexity, prevent plausible drift,
  or encode a non-obvious invariant.

Risks:

- **Highest-risk item:** decomposing `ccc performGraphiteMaintenance`, which
  mutates local Graphite refs *after irreversible merges*. A regression here is
  costly; the existing up-front `expectedShas` snapshot and merge→verify→cleanup
  ordering must be preserved exactly. Treat this as the item most needing
  careful test coverage before refactor.
- The `branch-context` shell-out boundary decision is resolved and the
  branch-context migration risk is de-risked: `branch-context` now uses the
  in-process `@sdl/brmem` gateway, its subprocess/JSON parse layer is gone, the
  dry-run preview no longer claims a `brmem put` command will run, and CLI
  scenario tests cover attach/list/get/check/delete failure diagnostics. The
  related `@sdl/core/brmem-cli` candidate-framework collapse is now complete:
  `@sdl/core/brmem-cli` exports a single `runBrmem` runner, the public
  candidate-iteration surface (`resolveBrmemCommandCandidates` /
  `runBrmemCandidate` / `runFirstAvailableBrmemCommand` plus the candidate/option
  types) and the dead `readOptionalBrmemBooleanField` are gone, and
  `ccc/worktree-status.ts:loadBrmemStatus` calls `runBrmem` once instead of its
  own candidate loop. The original "single hardcoded candidate" premise was
  stale — the resolver returns up to two candidates (PATH `brmem` + `pnpm exec`
  fallback, added in `0ae09c8d9`); that two-candidate behavior was deliberately
  preserved inside `runBrmem` and is locked by a new fallback unit test, so the
  collapse is byte-for-byte behavior-preserving. `graphqlErrorsFromJson` remains
  deleted. All TS gates pass (`ts-format-check`, `ts-lint`, `ts-check`,
  `ts-test`, `ts-deps-check`, `ts-guard`). The brmem/core GitGateway composition
  slice is also complete: brmem delegates current-branch and Git branch-ref facts
  to core `GitGateway` while retaining its Branch Memory Snapshot Ref encoding
  pre-check and local object/ref plumbing; `branch-context` no longer carries its
  handwritten target-branch validator and validates target branches through core
  Git before plan-file I/O or mutation. Full TS gates pass for that slice.
- A shared `defineCli` helper touches every CLI entrypoint at once; a subtle change to
  IO/exit-code/entry-guard semantics could regress every CLI simultaneously.
  Mitigate by landing it behind scenario-test coverage of `--version`,
  `--runtime`, and `-h` across CLIs.

## Open Questions

- The `execGroup(description?)` placement question is closed by rejection: do
  not add the helper in `clinkr` or a shared CLI helper layer unless new evidence
  shows it buys a real invariant or removes substantial mental load. The
  `defineCli` half is resolved in current code: it lives in
  `@sdl/core/cli-entry` (`ts/packages/infra/core/src/cli-entry.ts`), and all
  `cli.ts` entrypoints consume it (14 at HEAD).
- For the two `legacyCommand`-based CLIs (`plans`, `branch-context`), is
  migrating off the deprecated path in scope here or a separate Objective?
