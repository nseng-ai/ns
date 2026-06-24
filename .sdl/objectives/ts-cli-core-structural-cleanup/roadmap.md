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
- [x] Collapse the `@sdl/core/brmem-cli` multi-candidate framework to a single
      `runBrmem`; fix the duplicated candidate-loop at `ccc/worktree-status.ts`;
      delete dead exports `graphqlErrorsFromJson`, `readOptionalBrmemBooleanField`.
      Evidence: `@sdl/core/brmem-cli` now exports one runner, `runBrmem`, returning
      `CompletedBrmemRun | { type: "unavailable"; failures }`; the public
      candidate-iteration surface (`resolveBrmemCommandCandidates`,
      `runBrmemCandidate`, `runFirstAvailableBrmemCommand`, and the candidate/option
      types) is gone — grep across `ts/packages` finds zero occurrences of those
      names plus `readOptionalBrmemBooleanField` and `graphqlErrorsFromJson`.
      `ccc/worktree-status.ts:loadBrmemStatus` now calls `runBrmem` once instead of
      looping `resolveBrmemCommandCandidates`. **Behavior preserved**: the
      two-candidate fallback (PATH `brmem`, then
      `pnpm --config.verify-deps-before-run=false --dir <tsRoot> exec brmem`) lives
      inside `runBrmem` and is locked by a new fallback unit test — the original
      review's "single hardcoded candidate" premise was stale (commit `0ae09c8d9`
      added the fallback) and was deliberately NOT dropped. Gates green:
      `just ts-format-check`, `just ts-lint`, `just ts-check`, `just ts-test`
      (3022 passed), `just ts-deps-check`, `just ts-guard`.
      See `references/branch-memory-access.md` and `references/asdl-core.md`.
- [x] Compose core `GitGateway` inside `brmem/real-git-gateway.ts`; remove the
      duplicated `currentBranch` and Git branch-ref validation primitives while
      keeping Branch Memory Snapshot object/ref plumbing local to brmem.
      Evidence: `RealGitBrmemGateway` now requires an options object with shared
      `commands` and `git` seams, delegates current-branch and Git branch-ref
      checks to `GitGateway`, keeps brmem's `---` Snapshot Ref encoding pre-check,
      and production contexts share one command executor between core Git and
      brmem. `branch-context` now validates target branches only through
      `GitGateway.validateBranchRef`; the old handwritten target-branch validator
      is gone and invalid branches fail before plan-file I/O, branch creation, or
      Branch Memory attachment. Gates green: focused brmem/branch-context/handoff
      and core tests plus `just ts-format-check`, `just ts-lint`, `just ts-check`,
      `just ts-test`, `just ts-deps-check`, `just ts-guard`.
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

### Absorbed from `ts-cli-architecture-deepening` (subsumed)

These deepening candidates migrated from the closed `ts-cli-architecture-deepening`
Objective. They use the `improve-codebase-architecture` vocabulary (module /
interface / depth / seam / deletion test); the reasoning is carried across intact,
not flattened. The audit `reference/` directory remains in the closed Objective.

- [ ] **Collapse slot-dispatch into one orchestration module** (`ccc/cmux`) —
      `dispatch-prompt.ts` (432), `dispatch-from-trunk.ts` (198), and
      `slot-dispatch-plan.ts` (548) re-spell the same four-step sequence (branch →
      Branch Memory payload → slot checkout → cmux workspace). Introduce a
      `SlotDispatchPlan` module owning the sequence behind `(branch, payload,
      metadata)`; the dispatch handlers become thin call sites. Deletion test:
      complexity concentrates in one module instead of three. *Open Question
      (carried): does `slot-dispatch-plan.ts` already contain most of the target
      shape, making this a consolidation of the two handlers onto it rather than a
      new module?*
- [ ] **Hide occupancy reconciliation behind the slot inventory** (`slot`) —
      `inventory.ts`, `planning.ts`, and `operations/gt/navigation.ts` each
      re-derive slot state by pattern-matching `SlotRecord.branch === null`. A
      reconciler module owns merging worktree state with occupancy metadata and
      exposes `reconcile()` plus a pure occupancy lookup; `SlotRecord` becomes
      immutable output. Deletion test: the `branch === null` discriminant stops
      leaking into three callers.
- [ ] **Put a stack-navigator adapter over Graphite's discriminants** (`slot/gt`)
      — `SlotGtGateway` exposes raw topology discriminants and entangles git
      checkout with Graphite reasoning, forcing tests to mock both gateways for one
      move. A `GraphiteStackNavigator` adapter absorbs the discriminants and error
      classification behind `{ branch | error }`. *Must stay inside the `slot gt`
      boundary and use Graphite plumbing (`gt parent/children --no-interactive`),
      never parsed display output (runtime Graphite-dependency boundary).*
- [ ] **Pull objective-markdown rules into one validator** (`objective`) —
      `ObjectiveStorage` only reads files while each operation re-applies its own
      heading/structure rules. An `ObjectiveMarkdownValidator` owns
      objective/roadmap/update structure so a schema change lands in one module;
      I/O stays a thin gateway. *If a live `objective` capability migration takes
      ownership of this surface first, cross-reference that ownership instead of
      duplicating the validator here.*
- [ ] **Deepen Branch Memory behind an entry locator** (`brmem` / `handoff` /
      `branch-context`) — next-layer deepening on this Objective's *already-shipped*
      gateway migration (in-process `BrmemGateway`, `@sdl/core/brmem-cli` collapse,
      brmem/core `GitGateway` composition), not a duplicate of those completed rows.
      Concentrate ref naming/encoding (`buildSnapshotRef`, `encodeBranchName`) +
      validation that currently leak into brmem operations, handoff, and
      branch-context behind a `BrmemEntryLocator.parse()` and a thin
      `BrmemEntriesGateway`. Ref encoding/locator mechanics belong in `@sdl/brmem`
      **only** as neutral Branch Memory storage infrastructure; any branch-context
      capability-domain API shape must respect ADR 0009 layering (see the layering
      guardrail in `objective.md`). *Widest blast radius — treat ref encoding as
      compatible/append-only and cover it with the locator's own tests before
      migrating callers.*
- [ ] **Replace the shallow brmem adapter with a plan-attachment module**
      (`branch-context`) — branch-context-side next layer composing onto the entry
      locator above. The branch-context gateway is a shallow adapter over brmem CLI
      output; `attach.ts` and `attached-plan.ts` still reference the namespace
      constant and construct entry keys. A `PlanAttachmentStorage` module hides
      namespace + key semantics so callers work in slugs. *This is a branch-context
      capability/domain seam and a likely input to the future branch-context
      capability-extension migration tracked by `sdl-extension-architecture`; classify
      it against ADR 0009 layering before placing it. Does not subsume or conflict
      with the parked `legacyCommand`-migration row below — that row is about the
      CLI command-rendering path, this one is about Branch Memory plan storage.*

## Parked

- [ ] Migrate the two `legacyCommand`-based CLIs (`plans`, `branch-context`) off
      the deprecated `legacyCommand` path onto the rendered `command(...)` shape.
      Parked pending the open question of whether this belongs in this Objective
      or its own. See `references/cli-wiring-layer.md`.
