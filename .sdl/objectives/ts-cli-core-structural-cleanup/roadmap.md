# Roadmap

## Work

- [x] Shared `defineCli` helper in `@sdl/core/cli-entry` (runtimeInfo derivation,
      version reading, IO/cwd/env defaulting, `import.meta.main` entry guard);
      migrate all 15 `cli.ts` files onto it.
      See `references/cli-wiring-layer.md`. Pure subtraction; done first.
      Evidence: `defineCli` exists in `ts/packages/sdl-core/src/cli-entry.ts`, all 15
      `ts/packages/*/src/cli.ts` files consume it, no old hand-written
      `const VERSION`/`runtimeInfo`/`readPackageVersion` implementations remain in
      those entrypoints, package-local `sdlcc` `--runtime` coverage now exists, and
      `just ts-format-check && just ts-lint && just ts-check && just ts-test` passed.
- [x] Rejected: `clinkr` `execGroup(description?)` factory defaulting
      `name:"exec"` + `isHidden:true`; replace the hand-rolled hidden-exec
      constructions. See `references/cli-wiring-layer.md`.
      Decision: the implementation was reverted because it added a thin wrapper
      around already-correct, obvious `ClinkrGroup` construction and did not
      delete meaningful complexity. Do not reintroduce this helper without new
      evidence that it prevents plausible drift or removes substantial mental
      load.
- [x] Unify Branch-Memory access: point `branch-context` at the in-process
      `@asdl/brmem` `BrmemGateway`; delete the parsing half of its
      `brmem-gateway.ts` and its `@asdl/core/brmem-cli` dependency.
      Decision: `branch-context` should use the in-process gateway rather than a
      user-installed `brmem` shim, so implementation can proceed.
      Evidence: `branch-context` now uses `RealGitBrmemGateway` / `BrmemGateway`,
      `src/brmem-gateway.ts` and the branch-context JSON-envelope parser tests are
      gone, no `@sdl/core/brmem-cli` references remain under branch-context, the
      dry-run preview names the in-process gateway instead of `brmem put`, and
      CLI scenario tests cover attach/list/get/check/delete failure diagnostics.
      Validation passed with focused branch-context + affected consumer tests and
      the normal TypeScript gates (`ts-format-check`, `ts-lint`, `ts-check`,
      `ts-test`, `ts-deps-check`, `ts-guard`).
      See `references/branch-memory-access.md`.
- [~] Collapse the `@asdl/core/brmem-cli` multi-candidate framework to a single
      `runBrmem`; fix the duplicated candidate-loop at `ccc/worktree-status.ts`;
      delete dead exports `graphqlErrorsFromJson`, `readOptionalBrmemBooleanField`.
      Evidence: the current stack removed the candidate API and single-candidate
      loop (`resolveBrmemCommandCandidates` / `runBrmemCandidate` /
      `runFirstAvailableBrmemCommand`) in favor of `runBrmem`, and
      `ccc/worktree-status.ts` now calls that single runner directly. A grep no
      longer finds the candidate APIs or `graphqlErrorsFromJson`; the remaining
      known open part is deleting `readOptionalBrmemBooleanField`.
      See `references/branch-memory-access.md` and `references/asdl-core.md`.
- [ ] Compose core `GitGateway` inside `brmem/real-git-gateway.ts`; remove the
      duplicated `runGit`/`currentBranch`/branch-validation primitives.
      See `references/cross-package-dedup.md`.
- [ ] Add `resolveBranchOrCurrent` to asdl-core and replace the 4 per-package
      copies; pick one canonical branch-name validator and remove the 3 divergent
      rule-sets. See `references/cross-package-dedup.md`.
- [ ] Export `ghAuthorSchema`/`normalizeAuthor`/`numericGithubIdentity` from the
      `github-pr-feedback` barrel; delete roaster's divergent leaf-helper copies
      (resolves the `numericId` id-policy drift).
      See `references/cross-package-dedup.md`.
- [ ] Delete the vestigial `@asdl/core` root `.` export; repoint the single bare
      importer (`pi-extensions/harness-session.ts`) at `/primitives`.
      See `references/asdl-core.md`.
- [ ] Decompose `areg/real-gateways.ts` (1358) per-gateway into `src/gateways/*`
      + extract `project-fs.ts`; collapse the `init`/`skill-kind` policy fork to a
      `{isAllowed, codePrefix}` descriptor; extract a shared pure
      `classifySkillSpecResolution` so the fake stops reimplementing policy.
      See `references/areg.md`.
- [ ] Decompose `ccc performGraphiteMaintenance` (270-line god-function) per
      phase, resolving `maintenance.kind` into a plan object once; split
      `landing-operations.ts` (1010) and move message-English to `presentation.ts`.
      Highest-risk item — land test coverage first. See `references/ccc.md`.
- [ ] Unify ccc Graphite-metadata reads into one `loadGraphiteTopology` in
      `@asdl/core/graphite-metadata`; route `land-stack` git facts through
      `RealGitGateway` and GitHub access through `@asdl/core/github-cli`.
      See `references/ccc.md`.
- [ ] sdlcc: replace the hand-rolled validation tower in
      `stack-map-model-loader.ts` with Zod boundary schemas; delete the
      parsed-but-unread `edges` (and its required-gate), `surfaceType`, `tty`.
      See `references/per-package-cleanups.md`.
- [ ] aretro: split generic JSON accessors out of `pi-jsonl-source.ts` (767) into
      `pi-json-accessors.ts`; unify the two divergent `bashExecution` count paths.
      See `references/per-package-cleanups.md`.
- [ ] sdl: replace the reflective `MANIFEST_COMMAND_FIELDS` engine in
      `extension-discovery.ts` (531) with a Zod schema; de-dup the
      `index.ts`/`index.js` dir-index block. See `references/per-package-cleanups.md`.
- [ ] packagechk: collapse `ClaimPolicy`/`ClaimPlan` (N=2 over-abstraction) into
      two linear `runPypiClaim`/`runNpmClaim` functions sharing small helpers.
      See `references/per-package-cleanups.md`.
- [ ] vibechk: refactor `workflow.ts:executeRun` (mutable-`let`/dual-try-catch)
      into `runRunner`/`capturePostRun`; delete the dead empty-diff write, the
      duplicate `GitProvenance`, dead `artifacts`/`transcript`, the redundant
      `models.ts:137` cast, and `normalizeRunsFormatArgs` (rename field to
      `format`). See `references/per-package-cleanups.md`.
- [ ] asdl-core `submit/`: collapse prewrite vs post-submit PR-description
      duplication + the `reconcilePrewrittenPr` third path; extract the 3×
      failure-transcript spread; resolve the two same-named `formatOutputSection`;
      prune `submit/index.ts` no-consumer re-exports; delete alias-only
      `submit/result.ts`. See `references/asdl-core.md`.
- [ ] ccc small dedup: promote `firstNonEmptyLine` (2×) and reuse the canonical
      `isRecord` (3×); import the canonical `gt restack`/`submit` arg builders
      instead of re-inlining; present `presentLandStackFailure` once instead of at
      15 early-return sites. See `references/ccc.md`.

## Parked

- [ ] Migrate the two `legacyCommand`-based CLIs (`plans`, `branch-context`) off
      the deprecated `legacyCommand` path onto the rendered `command(...)` shape.
      Parked pending the open question of whether this belongs in this Objective
      or its own. See `references/cli-wiring-layer.md`.
