# TS CLI + asdl-core Structural Cleanup

## Thesis

A thermo-nuclear code-quality review of all 15 TypeScript CLIs plus the shared
`asdl-core` package found that the fleet's foundations are strong (no
`as unknown as`, no `any`, errors-as-values throughout, gateway seams, Zod at
most boundaries) but that the same handful of concepts are reimplemented 3–15
times across packages instead of living once in the shared layer, and that three
files/functions have crossed the size/cohesion line. Almost every high-leverage
fix is a cross-package "code judo" move that *deletes* code by pulling repeated
concepts down into `@asdl/core` / `clinkr`, or that decomposes a god-file. This
Objective tracks landing all of those findings as independently reviewable
changes.

The full review — with file:line evidence, severity, and concrete remedies for
every finding — is preserved under `references/` (start at `references/README.md`).
Scope and roadmap below summarize it; the reference files are the source of truth
for implementation detail.

## Scope

In scope — the verified review findings, grouped:

- **Shared CLI wiring layer (holistic):** a `defineCli` helper in
  `@asdl/core/cli-entry` owning `runtimeInfo` derivation, version reading,
  IO/cwd/env defaulting, and the `import.meta.main` entry guard (collapses ~150
  lines of boilerplate copy-pasted across 14–15 `cli.ts` files and kills the
  stale-version and runtimeInfo-desync latent drift bugs); a `clinkr`
  `execGroup(description?)` factory so the hidden-`exec` convention cannot be
  wired inconsistently.
- **Branch-Memory access unification:** point `branch-context` at the in-process
  `@asdl/brmem` `BrmemGateway` (as `handoff` already does) instead of shelling
  out to the `brmem` CLI + re-parsing JSON; collapse the
  `@asdl/core/brmem-cli` multi-candidate framework (which always returns one
  hardcoded candidate) to a single `runBrmem`; have `brmem`'s
  `real-git-gateway.ts` compose the core `GitGateway` for generic facts rather
  than re-deriving `runGit`/`currentBranch`/branch-validation.
- **Cross-package dedup:** one `resolveBranchOrCurrent` helper (4 copies today);
  one canonical branch-name validator (3 divergent rule-sets today); export
  `ghAuthorSchema`/`normalizeAuthor`/`numericGithubIdentity` from the
  `github-pr-feedback` barrel and delete roaster's divergent copies; delete the
  vestigial `@asdl/core` root `.` export; delete confirmed-dead exports
  (`graphqlErrorsFromJson`, `readOptionalBrmemBooleanField`).
- **God-file / god-function decomposition:** split `areg/real-gateways.ts`
  (1358 lines, 6 unrelated gateways + a 600-line FS toolkit) per-gateway and
  collapse the `init`/`skill-kind` policy fork to a data descriptor; share a
  pure `classifySkillSpecResolution` so the areg fake stops reimplementing
  resolution policy; decompose `ccc` `performGraphiteMaintenance` (270-line
  four-state-machine god-function over post-merge ref mutation) per phase and
  split `landing-operations.ts` (1010 lines), moving message-English to
  `presentation.ts`.
- **ccc boundary convergence:** one shared `loadGraphiteTopology` in
  `@asdl/core/graphite-metadata` (two divergent read paths today); route
  `land-stack` git facts through `RealGitGateway` and GitHub access through
  `@asdl/core/github-cli` (the same package already does this in
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

## Completion Criteria

- The shared `defineCli` + `execGroup` helpers exist and all CLIs consume them;
  `runtimeInfo`/version/entry-footer boilerplate and the hand-rolled hidden-exec
  construction are gone from individual `cli.ts` files.
- `branch-context` reads/writes Branch Memory through the in-process gateway; the
  parsing half of its `brmem-gateway.ts` and its `@asdl/core/brmem-cli`
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
- The work is decomposable into many small, independently reviewable changes;
  most items are pure subtraction and do not depend on each other.
- The CLI scenario tests plus `just` are a sufficient behavior-parity net for
  refactors of this shape.

Risks:

- **Highest-risk item:** decomposing `ccc performGraphiteMaintenance`, which
  mutates local Graphite refs *after irreversible merges*. A regression here is
  costly; the existing up-front `expectedShas` snapshot and merge→verify→cleanup
  ordering must be preserved exactly. Treat this as the item most needing
  careful test coverage before refactor.
- The `branch-context` shell-out *may* be a deliberate boundary (invoking the
  user-installed `brmem` shim rather than linking the library). It is currently
  undocumented; if a real reason exists, the remedy is to document it rather than
  collapse it. Resolve this before deleting the parse layer.
- A shared `defineCli` helper touches all 15 CLIs at once; a subtle change to
  IO/exit-code/entry-guard semantics could regress every CLI simultaneously.
  Mitigate by landing it behind scenario-test coverage of `--version`,
  `--runtime`, and `-h` across CLIs.

## Open Questions

- Is `branch-context`'s `brmem` CLI shell-out deliberate (user-installed shim)
  or accidental divergence? Decision gates whether B3's parse-layer deletion
  proceeds.
- Should the shared `defineCli`/`execGroup` helpers live in `@asdl/core/cli-entry`
  or in `clinkr` itself? (`cli-entry` already hosts `isDirectCliInvocation` and
  is imported by 14/15 CLIs, suggesting it; `execGroup` is more naturally a
  `clinkr` factory.)
- For the two `legacyCommand`-based CLIs (`plans`, `branch-context`), is
  migrating off the deprecated path in scope here or a separate Objective?
