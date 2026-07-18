# Split Real-I/O Test Boundaries for Vercel Package Guards and the ns Host

## Goal and outcome

Advance the standing Objective `standing-test-performance-boundaries` with one bounded test-boundary slice covering the two measured default-lane files:

- `ts/packages/capabilities/vercel/test/api/package-boundary.test.ts` (5 tests, observed 193 ms)
- `ts/packages/hosts/ns/test/ns-cli.test.ts` (16 tests, observed 319 ms)

The intended outcome is:

1. The Vercel suite’s three checks against the live checked-out package tree run in the explicit TypeScript integration lane. Its two source-string parser tests remain in the default lane as pure tests.
2. The ns host suite keeps composed help/schema/catalog/CLI behavior in the default lane, per the user’s explicit preference to move only real-I/O cases. Move only the extension repository-inspection cases and skills provisioning cases that intentionally exercise the real filesystem/repository adapters.
3. Preserve every existing behavior assertion. Do not delete coverage, weaken assertions, introduce hidden environment gates, change production behavior, or broaden test/CI conventions.
4. Record comparable timing, lane-discovery, coverage-retention, and cost-shifting evidence in the selected standing Objective.

This is a local implementation plan. Do not create a branch, commit, submit a PR, publish, deploy, or perform any other external write unless separately authorized.

## Objective and policy context

Selected Objective: `.ns/objectives/standing-test-performance-boundaries/`.

The Objective’s durable direction is that default tests stay fast and fake-driven while tests requiring real Git, subprocess, sqlite, filesystem-heavy setup, runtime loading, or similar real boundaries live in the explicit integration lane. Its Runner Policy permits one bounded, locally validated migration when coverage retention is clear. This plan is such a slice.

The Objective is standing and has no goal-met finish line. Completing this slice should produce a Semantic Update and refreshed roadmap evidence, not close the Objective.

At planning time, `ns objective exec tracking-gate standing-test-performance-boundaries --format json` resolved the diff basis as `master...HEAD`. The worktree was clean. The branch had many committed changes for other Objectives, but no changes under this Objective and no clear unrecorded progress for this test-boundary slice. A downstream session should re-run the tracking gate because branch/worktree state is volatile and should not treat unrelated branch changes as part of this implementation.

## User decisions from grilling

Two placement decisions are fixed for this plan:

- **Vercel:** move the live package-tree checks to integration rather than optimizing them in the default lane. Keep only pure parser/source-string behavior in default.
- **ns host:** move only real-I/O cases. Do **not** move every composed `runNsCli` contract merely because it uses the production host. Keep the help, schema, command catalog, output, argument parsing, and other composed-host contracts in default unless the test itself invokes real repository/filesystem behavior.

## Discovered facts and boundary classification

### Shared lane contract

`ts/TESTING.md`, `ts/vitest.shared.ts`, `ts/vitest.config.ts`, and `ts/vitest.integration.config.ts` establish:

- default tests discover package `test/**/*.test.ts` except specialized lanes;
- integration tests belong under `test/integration/**/*.test.ts`, with `integration/` directly under the package test root;
- `pnpm --dir ts run test` / `just ts-test` runs default tests;
- `pnpm --dir ts run test:integration` / `just ts-test-integration` runs integration tests;
- explicit Vitest file filters can force an excluded file, so normal lane-discovery proof should list a package test tree and grep for the moved file, not rely only on listing the explicit integration path under the default config.

### Vercel package-boundary suite

Current file: `ts/packages/capabilities/vercel/test/api/package-boundary.test.ts`.

The suite currently mixes three concerns:

1. real package-tree discovery and reads (`readdirSync`, `readFileSync`, `existsSync`);
2. pure TypeScript source analysis (`importSpecifiers`, `hasExactGtLiteral`, AST traversal);
3. policy assertions over the live Vercel package tree.

The three live-tree policy tests are:

- `keeps package-shared config out of dispatch-client ownership`;
- `allows only the curated Flow API at local dispatch composition`;
- `keeps Flow out of API, Workflow, and Sandbox deployable closure`.

They recursively enumerate or traverse checked-in production files under `api`, `scripts`, `src`, and `workflows`, read source text, parse imports, probe path existence, and/or follow the deployable relative-import closure. Their subject is the real checked-out package layout, so the user chose to retain them as integration coverage.

The two pure source-string tests are:

- `inspects only real static and dynamic module specifiers`;
- `detects exact executable gt literals without matching comments or other text`.

They need no filesystem and should remain in default discovery.

Module initialization currently computes `DEPLOYABLE_ROOTS` using real directory reads, so simply leaving the fixture tests in the same module would continue charging real-I/O cost to the default lane. The split must ensure the default parser-test module imports no module that performs package-root discovery at load time.

Relevant symbols:

- `productionTypescriptFiles`
- `typescriptFilesAt`
- `typescriptFilesUnder`
- `transitiveSourceImports`
- `importSpecifiers`
- `hasExactGtLiteral`
- `visitTypeScript`
- `readPackageFile`

The pure AST helpers use `parseTypeScriptSource` and `moduleSpecifierText` from `@nseng-ai/foundation/typescript-analysis`; parsing supplied source text is not itself a real-I/O boundary.

### ns host CLI suite

Current file: `ts/packages/hosts/ns/test/ns-cli.test.ts`.

`createEmptyProject()` in `test/support/cli-harness.ts` uses a real temporary directory and cleanup. `runNsCliJson()` composes the production `runNsCli` host with explicit cwd/home/env and captured output. The user chose not to classify every composed-host contract as integration solely for that reason.

Move these complete test blocks because they intentionally cross real repository/filesystem boundaries:

1. `publishes extension list help, schema, and failure contracts`
   - Its failure case invokes real repository inspection against a non-Git temporary directory.
2. `publishes extension uninstall help, schema, usage, and failure contracts`
   - Its failure case likewise invokes real repository inspection.
3. `previews skill install without writing target files or manifest`
   - Exercises packaged skill reads and real target-path nonexistence checks.
4. `installs a skill into a temp project target and writes the manifest`
   - Writes and reads the real target skill and manifest.
5. `refuses to overwrite a locally edited installed skill without force`
   - Performs a real install, direct local edit, second install attempt, and final file read.

Keep the other eleven tests in `ns-cli.test.ts`, including:

- static SDK barrel exhaustiveness;
- top-level and command help/catalog composition;
- extension install help/schema/usage (no real install is attempted);
- first-party skills list;
- the one-case skills path host-wiring smoke;
- update help/failure/retired-flag contracts.

Coverage-retention evidence already exists below the host boundary:

- `ts/packages/capabilities/harness-artifacts/test/skills-path.test.ts` covers path semantics;
- `ts/packages/capabilities/harness-artifacts/test/first-party-skill-provisioning.test.ts` fake-covers dry run, apply, manifest writing, and local-conflict behavior;
- `ts/packages/capabilities/ns-init/test/scenario/list-extensions.test.ts` fake-covers the not-a-Git-repository list failure;
- `ts/packages/capabilities/ns-init/test/scenario/uninstall-extension.test.ts` fake-covers the stable uninstall repository failure;
- `ts/packages/sdk/test/unit/extension-registry.test.ts` covers preinstalled registry/catalog derivation;
- `ts/packages/hosts/ns/test/integration/skills-path.test.ts` retains the broader six-case host alias/scope matrix.

Existing host integration patterns include:

- `test/integration/extension-install-host.test.ts`
- `test/integration/skills-path.test.ts`
- `test/integration/node-runtime-cli.test.ts`
- `test/integration/slot-alias-cli.test.ts`

## Files and intended structure

### Vercel

Create a clean three-part split:

- `ts/packages/capabilities/vercel/test/support/package-boundary-analysis.ts`
  - package-local pure test support;
  - owns `importSpecifiers`, `hasExactGtLiteral`, and their private AST traversal helper;
  - must not import `node:fs`, compute `PACKAGE_ROOT`, or perform package discovery at module initialization.
- `ts/packages/capabilities/vercel/test/api/package-boundary-analysis.test.ts`
  - default-lane tests for source-string import detection and exact `gt` literal detection;
  - imports only the pure support module.
- `ts/packages/capabilities/vercel/test/integration/api/package-boundary.test.ts`
  - live checked-out package-tree policy checks and filesystem discovery/read/closure helpers;
  - imports the pure source-analysis helpers;
  - keeps `integration/` directly below the package test root.

The old `test/api/package-boundary.test.ts` should disappear after its assertions are divided between the two new test files. Git may recognize this as a move; coverage, not rename detection, is the requirement.

Do not create a production API or a repository-wide filesystem gateway for this test-only architecture guard.

### ns host

Keep:

- `ts/packages/hosts/ns/test/ns-cli.test.ts`
  - remove the five real-I/O blocks and now-unused imports/helpers only;
  - retain the eleven selected default-lane contracts.

Add focused integration files:

- `ts/packages/hosts/ns/test/integration/extension-command-contracts.test.ts`
  - move the extension list and extension uninstall help/schema/usage/non-repository failure blocks intact;
  - reuse `createEmptyProject`, `runNsCli`, `runNsCliJson`, and `parseJsonOutput` from existing host test support;
  - do not merge these into the already-large lifecycle-focused `extension-install-host.test.ts`.
- `ts/packages/hosts/ns/test/integration/skills-install.test.ts`
  - move the dry-run, applied install/manifest, and local-conflict cases intact;
  - keep filesystem assertions and JSON-envelope assertions unchanged.

Likely import cleanup in `ns-cli.test.ts`:

- remove `access` and `writeFile` from `node:fs/promises` after moved blocks no longer use them;
- retain `readFile` for SDK export-surface checks;
- remove `pathExists` from the default file and define it only in `skills-install.test.ts` if still useful there;
- retain `dataFromEnvelope` and related harness imports needed by the default skills-path smoke.

No production files are expected to change. If implementation reveals that moving these tests requires a production seam or public API change, stop and re-scope rather than broadening this slice.

### Objective tracking

After implementation evidence is final:

- add one immutable Semantic Update under `.ns/objectives/standing-test-performance-boundaries/updates/` using the repository’s timestamp naming convention;
- update the active rebaseline/migration evidence in `.ns/objectives/standing-test-performance-boundaries/roadmap.md` only if needed to identify this as the latest completed slice and its durable lesson;
- do not rewrite an existing update;
- do not close the standing Objective.

The update must distinguish cost **shifted** into integration from cost eliminated. Include the exact measured commands, baseline and post-change timings, repetition/noise notes, discovery proof, and coverage retention.

## Implementation steps

1. **Revalidate repository and Objective state.**
   - Read root and `ts/` agent instructions and the selected Objective files.
   - Run `ns objective exec load-orientations --format md`.
   - Run `ns objective exec tracking-gate standing-test-performance-boundaries --format json`.
   - Confirm no new uncommitted or branch progress for this same slice needs an Objective update first. Do not disturb unrelated branch changes.

2. **Capture comparable baseline evidence before edits.**
   - Run each target file alone under the default config with a verbose reporter, recording file/test counts, total duration, test-body time where reported, and notable per-test timings:
     - `pnpm --dir ts exec vitest run --config vitest.config.ts packages/capabilities/vercel/test/api/package-boundary.test.ts --reporter verbose`
     - `pnpm --dir ts exec vitest run --config vitest.config.ts packages/hosts/ns/test/ns-cli.test.ts --reporter verbose`
   - Prefer at least two runs if local noise is material; report honestly if only one sample is taken.
   - Record a default discovery baseline for each package test tree.

3. **Split Vercel pure analysis from live-tree policy.**
   - Extract only source-string analysis into `test/support/package-boundary-analysis.ts`.
   - Move the two fixture tests into `test/api/package-boundary-analysis.test.ts`.
   - Move the three live-tree checks plus package discovery/read/closure helpers into `test/integration/api/package-boundary.test.ts`.
   - Ensure `PACKAGE_ROOT`, `PRODUCTION_ROOTS`, `DEPLOYABLE_ROOTS`, `readdirSync`, `readFileSync`, and `existsSync` occur only in the integration module.
   - Preserve all existing policy constants (`ALLOWED_FLOW_IMPORTERS`, deployable roots), violation messages, and assertions.

4. **Move only the selected ns host real-I/O cases.**
   - Relocate the two complete extension list/uninstall contract blocks into `test/integration/extension-command-contracts.test.ts`.
   - Relocate the three complete skills install/dry-run/conflict blocks into `test/integration/skills-install.test.ts`.
   - Keep assertions intact. Do not convert composed-host default tests to lower-level unit tests in this slice.
   - Clean imports and move `pathExists` to the file that still needs it.

5. **Check coverage inventories before formatting.**
   - Confirm all five original Vercel test names occur exactly once across default and integration files.
   - Confirm all sixteen original ns host test names occur exactly once across the retained default file and new integration files.
   - Confirm the five user-selected ns real-I/O tests are absent from `ns-cli.test.ts` and present in integration.
   - Confirm no accidental production changes were introduced.

6. **Format using repository tooling.**
   - Run `just ts-format-fix` if formatting changes are needed; do not hand-format around oxfmt output.
   - Run `just dprint-fix` only if Objective Markdown fails dprint after tracking is written.

7. **Validate targeted behavior and lane discovery.**
   - Run the retained Vercel default parser suite.
   - Run the Vercel integration package-boundary suite with `vitest.integration.config.ts`.
   - Run retained `ns-cli.test.ts` under the default config.
   - Run both new ns integration files with `vitest.integration.config.ts`.
   - List each package’s test tree under the default config and verify the new integration paths are absent from normal default discovery.
   - List/run the integration paths under the integration config and verify every moved test is present.
   - Do not use an explicit integration file filter under the default config as the sole exclusion proof because Vitest can force explicitly named files.

8. **Capture post-change timing and compare like-for-like.**
   - Re-run the retained default files with the same reporter and conditions as the baseline.
   - Report Vercel default cost separately from the moved Vercel integration cost.
   - Report ns retained default cost separately from the two new integration files.
   - State that moving tests shifts their cost; claim a default-lane speedup only if comparable measurements support it.

9. **Run relevant TypeScript gates.**
   - At minimum: `pnpm --dir ts run check`, `just ts-format-check`, `just ts-lint`, targeted default tests, and targeted integration tests.
   - Run `just ts-test` and `just ts-test-integration` when practical for the final kept change because this slice changes discovery in both lanes.
   - The isolated lane is not touched; run it only if implementation unexpectedly affects isolation/shared-cache policy.
   - Run `just ts-test-typescript-style-guard` if test/support structure or imports trigger style-guard concerns.

10. **Record meaningful Objective progress.**
    - Write one Semantic Update with summary, Objective impact, performance evidence, cost handling, coverage retention, validation, and follow-ups.
    - Refresh roadmap evidence narrowly. A reusable lesson worth recording is that a live checked-out source-tree architecture guard may be classified as integration by explicit product choice even when its parser core is pure; isolate the pure parser tests so module initialization does not retain filesystem cost in default.
    - Run `ns objective check standing-test-performance-boundaries` after Objective edits.

11. **Review final scope and report.**
    - Inspect `git diff --stat` and `git diff`.
    - Confirm kept edits are limited to the planned test split and selected Objective tracking.
    - Report changed files, default/integration timings, validations, Objective tracking, and that PR submission remains out of scope.

## Execution strategy for the multi-file refactor

This plan has semantic same-purpose edits across more than five files (test extraction, relocation, import cleanup, and Objective evidence), so apply `skills/enriched-plan-save/references/refactor-execution-strategy.md` as follows:

- Prefer a **two-shard refactor-swarm** if the downstream environment provides that workflow:
  1. Vercel shard: pure analysis support plus default/integration package-boundary split.
  2. ns host shard: default-file cleanup plus the two focused integration files.
- Give shards non-overlapping file ownership. The parent/integrator alone should write the Objective Semantic Update after both shards are integrated and measured.
- If refactor-swarm is unavailable, execute the same two shards sequentially with precise semantic edits. Do not use an opaque `text.replace()` script to move test blocks.
- No AST codemod is warranted: this is a small semantic test-layer split, not a syntactic production API rename.
- Finish with exact test-name inventories and bounded grep checks so no test is duplicated or dropped.

## Validation guidance

Suggested targeted commands (paths are relative to `ts/` when passed to Vitest):

```sh
pnpm --dir ts exec vitest run --config vitest.config.ts \
  packages/capabilities/vercel/test/api/package-boundary-analysis.test.ts \
  --reporter verbose

pnpm --dir ts exec vitest run --config vitest.integration.config.ts \
  packages/capabilities/vercel/test/integration/api/package-boundary.test.ts \
  --reporter verbose

pnpm --dir ts exec vitest run --config vitest.config.ts \
  packages/hosts/ns/test/ns-cli.test.ts \
  --reporter verbose

pnpm --dir ts exec vitest run --config vitest.integration.config.ts \
  packages/hosts/ns/test/integration/extension-command-contracts.test.ts \
  packages/hosts/ns/test/integration/skills-install.test.ts \
  --reporter verbose
```

Normal-discovery checks should point at package test roots, for example:

```sh
pnpm --dir ts exec vitest list --config vitest.config.ts \
  packages/capabilities/vercel/test

pnpm --dir ts exec vitest list --config vitest.config.ts \
  packages/hosts/ns/test
```

Inspect the output to ensure no `test/integration/` file is listed. Then list the new files under `vitest.integration.config.ts` and verify moved test names are present.

Test-name inventory checks should use bounded `rg -n --max-columns 300 --max-columns-preview ... | head -n 200` searches in the affected package test roots. Avoid broad unbounded repository searches.

## Risks, assumptions, and stop conditions

### Assumptions

- The reported 193 ms and 319 ms observations are directional candidate evidence, not sufficient final before/after proof; implementation will capture comparable local baselines.
- Moving whole mixed extension test blocks is acceptable because each block’s failure contract intentionally invokes the real repository adapter, even though help/schema/usage assertions within the same block are deterministic.
- Lower-layer fake-driven tests named above continue to retain localized behavior confidence.
- No production seam is required.

### Risks

- Importing a support module that computes package roots or directory contents at module load would accidentally keep real-I/O cost in the Vercel default lane. Keep the support module strictly source-string-driven.
- Moving only part of a test block could duplicate setup or split one coherent command contract awkwardly. Move each selected block intact.
- Explicit Vitest file filters can misleadingly run an integration file under the default config. Use package-tree discovery for exclusion proof.
- Existing integration files are already substantial. Adding focused files is preferable to making `extension-install-host.test.ts` an unrelated catch-all.
- Timing can be dominated by transform/import noise. Report test-body and total timing where available, repeat when useful, and avoid overstated speed claims.
- The current branch contains unrelated committed work. Do not reformat, revert, amend, or attribute those changes to this Objective.

### Stop and ask

Stop rather than broadening scope if:

- preserving a selected assertion requires a production/public API change;
- a moved test is the only coverage for a user-visible contract and no retained default or lower-layer coverage can be demonstrated;
- integration discovery requires changing shared Vitest globs, commands, or CI topology;
- the working tree acquires overlapping unrelated edits in a planned file;
- targeted behavior changes rather than merely relocating lanes;
- Objective tracking evidence becomes ambiguous because concurrent work advances the same Objective.

## Review and remediation checklist

Before declaring the slice complete, review for:

- **Standards:** integration directories are directly under each package’s `test/` root; imports use explicit `.ts` suffixes for intra-package modules; no shared-cache banned APIs were introduced; no raw production boundary or public seam was added.
- **Spec:** exactly the three Vercel live-tree checks moved; exactly the two Vercel parser tests stayed default; exactly the five selected ns real-I/O blocks moved; the other eleven ns tests stayed default.
- **Coverage:** every original test name exists exactly once; assertions and expected outputs remain equivalent; lower-layer fake coverage still exists at the cited anchors.
- **Performance evidence:** baseline and post-change commands are comparable; shifted cost is labeled as shifted; no speedup is claimed solely from a file move.
- **Discovery:** package-tree default listing excludes new integration files; integration listing includes them.
- **Scope:** no production behavior, global testing convention, CI topology, external system, branch, commit, or PR changed.
- **Tracking:** one immutable Semantic Update was added, roadmap evidence was changed only if meaningful, and `ns objective check standing-test-performance-boundaries` passed.

If review finds a dropped assertion or duplicate test, restore a one-to-one test inventory before any further optimization. If the retained default timing remains unexpectedly high, record that evidence and leave deeper composed-host optimization as a separately selected future slice rather than expanding this implementation.