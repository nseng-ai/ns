# Implement `ns gs list` as a two-PR stack

## Goal and outcome

Add a new provider-branded, read-only ns command:

```bash
ns gs list
ns gs list --format json
ns gs list --limit 100
```

`gs` identifies the official `github/gh-stack` provider explicitly. The command lists every active stack available in the current Git repository by combining gh-stack’s local tracking state with stacks returned by GitHub, reconciling duplicates, omitting fully merged stacks, and sorting deterministically. It is static and non-interactive; it never opens gh-stack’s picker or mutates Git, GitHub, or provider state.

Deliver the work as the fewest coherent multi-PR stack: two PRs. PR 1 establishes the new incubating gh-stack extension package, provider adapters, pure reconciliation domain, compatibility fixtures, and fake-driven tests without exposing a partial command. PR 2 atomically activates the complete `ns gs list` command, stable machine contract, human renderer, registration/discovery coverage, integration/scenario tests, and canonical documentation.

## Settled product decisions

- **Ownership and route:** create a dedicated incubating ns extension, expected package identity `@nseng-ai/gh-stack`, whose command face begins at top-level `ns gs`. Do not put the command under Flow and do not implement a top-level alias owned by Flow.
- **Inventory scope:** combine locally tracked stacks and GitHub-only stacks into one active-stack inventory. Include unpublished local stacks. Deduplicate stacks represented by both sources. Omit stacks whose entries are all merged.
- **Provider labels:** match gh-stack’s existing picker semantics:
  - `local` means available locally, whether or not the same stack also exists on GitHub;
  - `remote` means GitHub-only.
  Do not introduce `local-and-github` or independent availability booleans in v1.
- **Failure policy:** strict in every mode. Failure to verify gh-stack installation, resolve the Git repository, read/interpret local provider state, authenticate/query GitHub, or interpret the Stacks response prevents inventory output. Do not degrade to local-only rows. Human mode renders a concise error on stderr; machine mode returns a structured Clinkr failure envelope and no partial successful data. A Stacks API 404 is also a typed failure (stacked PRs unavailable), not a successful local-only result.
- **Runtime prerequisites:** require both the `gh` CLI with authenticated GitHub access and the `github/gh-stack` extension. Preflight with `gh stack --version`, but do not pin to one exact binary version.
- **Local-state compatibility:** parse `.git/gh-stack` structurally and best-effort across schema versions. Ignore unknown additive fields and do not reject solely because a schema-version value is unfamiliar. Fail with a typed compatibility error when the required structure cannot be interpreted safely. Do not silently drop malformed stack records.
- **Output bound:** default to `--limit 100`, with human-facing short alias `-L`. Apply the bound only after reconciliation and deterministic sorting. Return count/completion metadata (`limit`, `returned`, `total`, `truncated`); human output must clearly state when rows were omitted and how to request a larger bound.
- **No initial filters:** defer `--local`, `--remote`, `--all`/`--include-merged`, and `--repo`. The initial command operates on the current Git repository and returns both source classes.
- **No Pi surface in this stack:** this is a human- and agent-usable ns CLI command. Do not add a Skill-Backed Command or Pi host adapter unless separately requested.

## Context and discovered facts

### Repository architecture

- Root rules are in `AGENTS.md`; TypeScript and CLI rules are in `ts/AGENTS.md` and `skills/internal/agent-engineering/ns-cli-design/SKILL.md`.
- ADR 0049, `docs/adr/0049-opt-in-provider-neutral-stacking.md`, requires stack-provider selection to be explicit, forbids ambient provider activation, isolates provider-private state inside adapters, and identifies a gh-stack adapter as follow-up work. `ns gs list` complies because the route names the provider and performs read-only inspection.
- `docs/conventions/stack-provider-capability-matrix.md` records gh-stack v0.1.0 observations and says any future adapter must revalidate pre-1.0 behavior before implementation.
- `docs/conventions/consumer-gateways-and-command-shape.md` requires extension-owned domain-first Consumer Gateways, composition-root construction of real adapters, fake-driven tests, and no premature Extension Kit export. Keep gh-stack command-shape and provider-private parsing inside the new package for this single consumer. Do not add `@nseng-ai/extension-kit/gh-stack` in this stack.
- New ns extension packages belong under `ts/packages/incubating/extensions/<leaf>/` and use `@nseng-ai/<leaf>` with `ns.tier: "extension"`; see `ts/packages/README.md`.
- Filesystem command discovery is descriptor-based. A package exposes `./ns-extension`, whose descriptor points `commandDirectory` at a filesystem-first Clinkr tree. Source-development discovery walks `ts/packages`; user-install tests maintain explicit source-extension cases.
- Existing examples:
  - `ts/packages/incubating/extensions/flow/src/ns/extension.ts`
  - `ts/packages/incubating/extensions/handoffs/src/ns/extension.ts`
  - `ts/packages/incubating/extensions/handoffs/src/ns/cli/handoff/list/{command,metadata}.ts`
  - `ts/packages/public/sdk/src/extensions/source-dev-sources.ts`
  - `ts/packages/public/ns/test/integration/source-user-extension-install-host.test.ts`
  - `ts/packages/public/sdk/test/integration/user-source-extension-registry.test.ts`
- ns commands use Clinkr schema → handler → `ClinkrExit<T>`, a real `resultSchema`, `--format json`, and `--json-schema`; stdout is the result and stderr is human error/status output. Process exits remain `0` success, `1` semantic negative, `2` failure/usage error.
- `CommandExecApi` and `NsCommandExecApi` provide the command seam. The canonical Git gateway exposes Git-common-dir facts; existing consumers demonstrate named narrowing around `gitCommonDir`. Do not run raw subprocesses from reconciliation logic.

### External/provider findings that must be treated as implementation evidence

These findings were originally captured in `/tmp/gh-stack-noninteractive-list-findings.md` after read-only inspection of `/Users/schrockn/code/github/gh-stack` and `/Users/schrockn/code/cli`. Do not edit either external repository during this work; the implementation belongs only in ns. Revalidate these observations against the installed provider before coding because gh-stack is pre-1.0:

- Installed provider observed during planning: `gh stack --version` reported `gh stack version 0.1.0`.
- `gh stack view --json` describes only the current stack; it does not enumerate all stacks.
- `gh stack checkout` without a target discovers all available active stacks but exposes them only through an interactive picker.
- The picker combines `.git/gh-stack` local state with `GET /repos/{owner}/{repo}/stacks`, enriches local stacks with remote metadata, deduplicates by stack number then provider ID, omits fully merged stacks, and sorts unpublished local work first followed by descending stack number.
- The Stacks API representation includes stack ID, repository-scoped stack number, base ref, open state, creation time, and ordered pull requests containing number, state, draft state, merge time, and head ref.
- gh-stack picker terminology treats every locally available stack as `Local`, even if it also exists on GitHub; `Remote` means GitHub-only.
- Local row status combines merged/open PR references with unpushed branches. Remote row status distinguishes merged, open, and closed PRs.
- A missing local `.git/gh-stack` file means no locally tracked stacks, not an error. An existing unreadable or structurally uninterpretable file is an error under the selected strict policy.

Capture the revalidated provider contract as checked-in package reference documentation or fixtures in PR 1 rather than relying on the temporary findings file or external source checkout.

## Stable command contract

### Human output

Use a plain, static table suitable for piping. Exact spacing/color is renderer-owned and may evolve, but the information hierarchy should be:

```text
NUMBER  BRANCHES                         BASE  STATUS               TYPE    CREATED
—       local-api...local-ui             main  2 unpushed           Local   —
128     bounded-api...bounded-ui         main  3 open               Remote  2h ago
121     auth-model...auth-tests          main  1 merged, 2 open     Local   3d ago
```

Requirements:

- `NUMBER` is `—` when a local unpublished stack has no number.
- `BRANCHES` is one branch for a one-branch stack, otherwise `bottom...top`; machine output still contains every ordered branch.
- `STATUS` lists nonzero counts in fixed order: merged, open, closed, unpushed.
- `TYPE` is `Local` or `Remote` with the picker semantics above.
- `CREATED` is a relative human age or `—`; do not put relative values in machine data.
- Empty inventory is successful and says `No active stacks found.` without treating emptiness as a negative outcome.
- If `truncated` is true, print a concise footer stating `returned` of `total` and showing `ns gs list --limit <larger>` as recovery guidance.
- No prompts, TUI, pager dependency, or terminal-only requirement.

### Machine result data

The `resultSchema` should be equivalent to:

```ts
{
  stacks: Array<{
    number: number | null;
    branches: string[];             // complete bottom-to-top order
    bottomBranch: string;
    topBranch: string;
    base: string;
    type: "local" | "remote";
    status: {
      merged: number;
      open: number;
      closed: number;
      unpushed: number;
    };
    createdAt: string | null;        // absolute RFC 3339 UTC value
  }>;
  limit: number;
  returned: number;
  total: number;
  truncated: boolean;
}
```

Clinkr wraps this data in the canonical machine envelope for `--format json`; do not hand-roll a second envelope. Use camelCase properties and kebab-case ns-owned failure discriminants. The array is always present, including `[]` for an empty successful inventory. Unknown number/time values are `null`, never the human em dash.

Validate `--limit` as a positive integer with a reasonable command-local maximum selected during implementation (document it in help/schema); invalid bounds return `usageError` with structured argument data. Do not let the renderer infer or reapply the bound.

### Failure classes

Model expected boundary failures as returned data and map them at the command edge. Stable command-local `errorType` values should cover at least:

- `gh-stack-extension-unavailable` — `gh stack --version` cannot run successfully;
- `git-repository-unavailable` — current Git repository/common-dir cannot be resolved;
- `gh-stack-state-read-failed` — existing local state cannot be read;
- `gh-stack-state-unsupported` — local JSON or required stack structure cannot be interpreted safely;
- `github-stack-discovery-failed` — `gh api`/auth/network/general API failure;
- `github-stacks-unavailable` — Stacks API 404/not enabled;
- `github-stack-response-unsupported` — remote JSON shape cannot be interpreted safely;
- an invariant failure for ambiguous reconciliation (duplicate/conflicting number or ID matches) rather than guessing.

Include structured recovery evidence without leaking tokens or huge raw responses: provider command, sanitized stderr summary, cwd, and relevant compatibility/detail discriminants. Machine failures must not carry a successful partial `stacks` array.

## Domain and adapter design

Keep the external interface small and the implementation deep. Suggested internal shapes may be renamed for local conventions, but preserve ownership:

- Provider-neutral-looking workflow vocabulary does **not** belong here; this package is intentionally provider-specific.
- Define structural boundary schemas for:
  - local gh-stack file and stack/branch/PR records;
  - remote Stacks API stack/base/PR records;
  - command result data.
- Parse external JSON from `unknown` with Zod. Be passthrough/tolerant of unknown additive fields while validating every field used for identity, ordering, status, and display.
- Use distinct parsed local and remote types. Convert them into a package-owned normalized reconciliation input before combining.
- Own domain-first Consumer Gateways such as installation verification, local-stack inventory, and remote-stack inventory. If those collaborators travel together across list operations, bind them in a named `GhStackListContext`; do not pass a raw dependency bag through the domain.
- Construct real adapters at the command composition root over the ns execution channel and explicit `cwd`/`env`. Tests use fakes or scripted exec seams.
- Resolve the absolute Git common directory through Git facts, then read `<commonGitDir>/gh-stack`. This supports linked worktrees and keeps provider state lookup out of command code.
- Remote discovery should invoke authenticated `gh api` for the current repository’s Stacks endpoint. Keep argv construction, response parsing, 404 classification, bounded stderr capture, and timeout policy in the real remote adapter. Do not invoke or modify the external gh-stack source repository.
- Verify gh-stack installation independently with `gh stack --version`; parse enough output to report observed version as diagnostic evidence, but do not gate on an exact version.
- Reconciliation is pure:
  1. index remote stacks by nonzero stack number and provider ID;
  2. reject ambiguous duplicate identities rather than last-write-wins;
  3. for each local stack, match number first, then provider ID;
  4. classify matched and unmatched local rows as `local`, and unmatched remote rows as `remote`;
  5. enrich matched local rows with authoritative remote number/base/created/PR state while retaining local unpushed branches;
  6. compute status counts;
  7. omit rows where all represented entries are merged and there are no open/closed/unpushed entries;
  8. sort unnumbered local rows first, then descending stack number, then creation time and summary as deterministic tie-breakers;
  9. compute `total`, apply `limit`, and derive `returned`/`truncated` after sorting.
- Preserve bottom-to-top branch order. If local/remote composition differs for a matched identity, do not silently replace local branch order. Define and test a conservative reconciliation outcome (prefer typed incompatibility unless the observed provider contract proves a safe mapping).

## PR stack

### PR 1 — `gh-stack-inventory-foundation`

**Priority profile:** high-confidence architecture and compatibility foundation.

**Review narrative:** establish one provider-specific module that safely turns gh-stack local and GitHub representations into a deterministic, tested inventory, with every external/private-state assumption isolated behind adapters.

**Why it cannot combine with PR 2:** separate review and revert value exists around the riskiest work: pre-1.0 provider compatibility, private-state parsing, external response validation, and reconciliation invariants. PR 1 exposes no incomplete CLI, while PR 2 can review the user contract against a stable domain interface.

**Expected files/areas:**

- New `ts/packages/incubating/extensions/gh-stack/` package:
  - `package.json`, `tsconfig.json`;
  - package-level `README.md` limited to implemented foundation behavior (update to full user docs in PR 2);
  - `CONTEXT.md` defining implemented provider-specific terms only;
  - `src/core/` normalized inventory types, status calculation, reconciliation, ordering, and limiting;
  - `src/gateways/` Consumer Gateway contracts, real local-state/GitHub/installation adapters, structural schemas/parsers, and composition context/factory;
  - package-local test fakes/fixtures as appropriate without creating an unnecessary public `testing` export;
  - `test/unit/` and focused `test/integration/` coverage.
- `ts/pnpm-lock.yaml` for the new workspace package/dependencies.
- Checked-in provider contract reference or fixtures recording the revalidated gh-stack v0.1.0 local/remote observations and the best-effort compatibility policy.
- `CONTEXT-MAP.md` only if PR 1 establishes durable glossary ground truth worth registering at that point; otherwise add it with CLI activation in PR 2. Do not document proposed terms ahead of implementation.

**Implementation steps:**

1. Revalidate `gh stack --version`, `gh stack view --json` help/shape, local state produced in a disposable repository, and the current Stacks endpoint response/help without modifying the external gh-stack source checkout. Sanitize and check in minimal representative fixtures and provenance.
2. Create the incubating package under the authoritative disposition/owner tree with dependencies only on public/incubating packages (likely Clinkr only in PR 2, Foundation exec/primitives, Extension Kit for existing Git/command support when justified, SDK only when the descriptor lands, and Zod).
3. Define external schemas and parsed types. Accept unknown schema versions and additive fields structurally; require only data actually needed. Treat an absent local state file as `[]`; reject unreadable, invalid JSON, malformed identity/branch records, or mixed valid/invalid arrays as typed failures.
4. Define domain-first Consumer Gateways and real adapters at clear seams. Keep Node filesystem/Git/`gh` mechanics below the gateway interface. Ensure the real context binds all subprocesses to the same ns command channel, cwd, env, timeout, and cancellation semantics.
5. Implement pure reconciliation/status/filter/sort/limit transformations. Avoid mutable inputs/outputs and encode expected incompatibilities as discriminated result data.
6. Add fake-driven unit tests for local-only, remote-only, matched-by-number, matched-by-ID, number-over-ID precedence, unpublished stacks, complete branch ordering, live remote enrichment, open/closed/merged/unpushed counts, fully merged filtering, deterministic sorting, limit metadata, duplicate/ambiguous identities, composition disagreement, unknown additive fields, unfamiliar schema versions, and malformed required structure.
7. Add focused adapter tests for missing state file, linked-worktree common dir, file read/JSON failures, `gh stack --version` success/failure, Stacks response parsing, API 404 classification, generic API/auth failure, and sanitized evidence. Keep real filesystem/Git subprocess coverage in the integration lane; use scripted command fakes for remote GitHub behavior in default tests.
8. Keep PR 1 free of `./ns-extension` and user-visible command activation unless the package loader requires a descriptor for package validity. If a descriptor is required, do not expose a `list` leaf until PR 2 and verify no misleading route appears.

### PR 2 — `activate-ns-gs-list`

**Depends on:** PR 1.

**Priority profile:** high-confidence user-visible vertical slice.

**Review narrative:** activate one complete Tier 0 inspection command with stable bounded machine output, honest human rendering, strict failure semantics, source/user extension discovery, and canonical documentation.

**Why it cannot combine with PR 1:** PR 2 is the independently reviewable public interface and activation boundary. It can be reverted without discarding the provider/reconciliation foundation, and it avoids exposing any partial behavior in the foundation PR.

**Expected files/areas:**

- New package command surface:
  - `src/ns/extension.ts`;
  - `src/ns/cli/gs/group.ts`;
  - `src/ns/cli/gs/list/command.ts` and `metadata.ts`;
  - command handler/composition root and human renderer modules if needed;
  - `package.json` `./ns-extension` export and final dependency/subpackage metadata.
- Final package `README.md` as the canonical install/quickstart/usage surface.
- `CONTEXT.md` and root `CONTEXT-MAP.md` synchronized with implemented GS command vocabulary.
- Source/user extension inventory tests:
  - `ts/packages/public/ns/test/integration/source-user-extension-install-host.test.ts` add `@nseng-ai/gh-stack`;
  - `ts/packages/public/sdk/test/integration/user-source-extension-registry.test.ts` add it;
  - `ts/packages/public/sdk/test/integration/source-dev-command-sources.test.ts` assert it is discovered, or generalize the assertion only if that improves the existing test without weakening it;
  - any package/disposition/style-guard fixture inventories that intentionally enumerate extension packages.
- `ts/package.json` dev dependency and `ts/pnpm-lock.yaml` if required by the repo’s source/self-hosting package inventory.
- New package `test/scenario/` command scenarios plus focused CLI integration tests.
- Update `docs/conventions/stack-provider-capability-matrix.md` from “follow-up only” to accurately record the shipped inspection adapter scope while preserving the distinction that Flow still has no gh-stack lifecycle adapter. Do not rewrite ADR 0049; ADRs are immutable records.

**Implementation steps:**

1. Add the `gs` filesystem command group and extension descriptor. Description should say it inspects official GitHub gh-stack provider state, not generic stacks or Flow workflows.
2. Define the Clinkr input schema with `limit` default 100, short alias `-L`, positive-integer validation, and a documented maximum. Define the exact result schema above and let Clinkr publish the machine envelope/`--json-schema`.
3. Compose the PR 1 real context only at the command edge. Execute strict preflight and both source reads before returning any list data. Map each typed domain/adapter failure to stable kebab-case `errorType`, structured bounded evidence, and useful human remediation.
4. Implement the human table and truncation footer. Keep primary successful output on stdout and failures on stderr. Ensure no TTY-dependent machine behavior and no prompt path.
5. Add scenario coverage for:
   - `-h`/`--help`, inherited `--version` and `--runtime` where the extension harness contract exercises them;
   - default table with local, remote, and matched rows;
   - `--format json` envelope and `--json-schema` matching the real result;
   - empty successful result;
   - default/custom limit and truncation guidance;
   - invalid zero/negative/non-integer/over-maximum limits as usage errors;
   - each representative strict failure, confirming no partial stdout/result data;
   - local label semantics for a stack also found on GitHub;
   - deterministic ordering and complete machine branch arrays;
   - proof the command never prompts or mutates.
6. Add source-development and user-install discovery coverage so `ns gs list` is available from this checkout and from a locally installed extension package without unrelated activation or filesystem mutation.
7. Finish README examples, prerequisites (`gh`, authenticated access, installed `github/gh-stack`, current Git repository), output semantics, limit behavior, strict completeness policy, and compatibility statement. Update context vocabulary only after code is authoritative.
8. Update the capability matrix and any package inventories that would otherwise claim no gh-stack adapter exists. State narrowly that ns ships a provider-specific read-only inventory adapter; topology/preparation/reconciliation/publication capabilities for generic Flow remain future work.

**Priority inversions:** none. The provider/domain foundation is both the prerequisite and the highest-risk/high-confidence work that should be reviewed first.

## Validation guidance

Follow repository policy rather than narrowing validation opportunistically.

Per PR, run at minimum:

```bash
just ts-deps-check
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-sanity
just ts-test-typescript-style-guard
just dprint-check
```

Run `just ts-test-isolated` if implementation adds tests that genuinely require isolated process/module state; do not place ordinary adapter tests there. Before final stack submission, run the default repository gate:

```bash
just
```

If formatting fails, use `just ts-format-fix` or `just dprint-fix` as directed, then rerun validation. Use `just ts-lint-fix` for autofixable lint failures.

Manual acceptance from an ns checkout with gh-stack installed and authenticated:

```bash
ns gs list
ns gs list -L 1
ns gs list --format json
ns gs list --json-schema
ns gs list -h
```

Exercise repositories with: no stacks, unpublished local stacks, a stack present locally and on GitHub, a GitHub-only stack, closed-but-unmerged PRs, and fully merged stacks. Also verify strict failures by temporarily using fake/scoped auth or scenario tests rather than damaging real provider state. Never edit `/Users/schrockn/code/github/gh-stack` as part of validation.

## Risks, assumptions, and deferred questions

### Risks and mitigations

- **Pre-1.0 private-state drift:** best-effort parsing may accept an unfamiliar version whose semantics changed despite structural similarity. Mitigate by validating every consumed field, rejecting ambiguous identities/compositions, recording provider fixtures/provenance, and returning typed incompatibility rather than guessing.
- **Remote API availability:** the Stacks API may be disabled (404), preview-gated, or change shape. Strict policy intentionally fails the command; classify disabled versus malformed/general failure and give actionable remediation.
- **Provider labels hide local-only versus local-and-GitHub:** this is an explicit compatibility choice. Preserve enough internal reconciliation information for correct enrichment, but do not add an unstable public boolean or third enum state in v1.
- **Limit after complete discovery:** `--limit` bounds output/context, not API or local parsing cost. This is acceptable for v1 correctness; do not introduce pagination semantics without endpoint evidence.
- **Package over-abstraction:** do not build a universal Stack Provider or promote one-consumer helpers into Extension Kit. The dedicated adapter may later become a capability provider only when a real Flow consumer exists and ADR 0049’s neutral contracts are implemented.
- **Strict failure surprise:** users cannot inspect local stacks while offline. This is deliberate. Make completeness and prerequisites prominent in help/README.

### Assumptions

- The Stacks endpoint can return the repository inventory needed by v1 through authenticated `gh api`; if pagination is documented/observed during revalidation, the real adapter must collect all pages before reconciliation without exposing JSONL or concatenated response details to the domain.
- gh-stack’s local state remains JSON at `<git-common-dir>/gh-stack`; the revalidation step must correct the adapter plan if current provider evidence differs.
- A missing local state file represents zero local stacks; any other local read/parse failure is fatal.
- The route name `gs` is stable user-facing vocabulary even though the package name is expected to be `@nseng-ai/gh-stack`.

### Explicitly deferred

- `--local`, `--remote`, `--all`/`--include-merged`, `--repo`, pagination, JSONL, and interactive checkout.
- Mutation commands, Flow submit/land/autobranch support, provider-neutral topology exports, and a Pi mirror.
- `@nseng-ai/extension-kit/gh-stack` promotion. Activation requires a second real consumer or another explicit single-consumer justification and demotion trigger under Extension Kit rules.
- A richer availability model distinguishing local-only from local-and-GitHub; revisit only with a demonstrated consumer need and additive machine-contract design.

## Review and remediation

### PR 1 review focus

- Confirm all provider-private file/API knowledge is confined to the gh-stack package’s real adapters and schemas.
- Confirm reconciliation is pure, deterministic, immutable, and independently testable through its small interface.
- Challenge best-effort compatibility cases: unfamiliar schema version, additive fields, missing identities, duplicate numbers/IDs, mismatched composition, malformed one-of-many records, and fully merged classification.
- Verify adapters receive explicit cwd/env/exec collaborators at the composition boundary and do not create alternate command channels in domain logic.
- Verify no user-visible `ns gs list` route is accidentally exposed.

Remediate PR 1 findings in PR 1 rather than papering over them in CLI code. If revalidation disproves a foundational assumption (state path, identity matching, endpoint shape), update the checked-in provider contract and reconciliation tests before proceeding upstack.

### PR 2 review focus

- Review help, README, renderer, result schema, and scenario assertions as one interface; they must agree exactly.
- Verify table and JSON describe the same bounded collection and that the limit is applied once after reconciliation/sort.
- Verify strict failure paths produce no successful partial inventory, all machine failures are structured, and empty inventory remains exit 0.
- Verify `Local`/`Remote` labels match the chosen picker semantics.
- Verify source/user extension discovery works and the command remains explicitly provider-branded rather than activating stack behavior elsewhere.
- Re-run the ns CLI authoring checklist in `skills/internal/agent-engineering/ns-cli-design/references/checklist.md` before submission.

Remediate interface mismatches in PR 2. Do not expand PR 2 into deferred filters or Flow integration. If review demonstrates the provider/domain interface must change, amend/restack PR 1 first, then adapt PR 2 so each commit remains independently coherent.
