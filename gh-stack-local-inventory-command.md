# Local-only `ns gs list`: gh-stack inventory as a fresh 3-PR stack

## Goal and user-visible outcome

Build a new incubating ns extension package `@nseng-ai/gh-stack` whose single command, `ns gs list`, answers exactly: **"What gh-stack stacks does this checkout know about locally?"** It reads only the local provider state file at `<git-common-dir>/gh-stack` (the Git common directory, so linked worktrees share one repository-level inventory). It never runs `gh stack --version`, never calls the GitHub API, and requires no `gh` installation, authentication, or network.

This deliberately supersedes a prior, larger implementation that lives unmerged on branch `gh-stack-inventory-command-activation` (commit `6db6da788`, PR #4271). That PR combined local state with GitHub's Stacks API behind strict two-source reconciliation (~2,388 added lines). The user judged it oversized and grilled a replacement design to completion. **Leave PR #4271 and its branch untouched — the user wants to compare the two implementations.** Do not close, force-push, or amend them.

## Provenance and drift anchors

- Planned from trunk `master` at `b48e973c4`, 2026-08-22.
- Trunk has **no** `ts/packages/incubating/extensions/gh-stack/` directory; the prior implementation exists only on branch `gh-stack-inventory-command-activation`. Verify before starting: `git ls-tree master ts/packages/incubating/extensions/ | grep gh-stack` should return nothing.
- Reference-only prior code is readable via `git show gh-stack-inventory-command-activation:ts/packages/incubating/extensions/gh-stack/<path>`. You may borrow surviving pieces (local Zod schema, table rendering helpers) but author fresh commits; do not cherry-pick `6db6da788`.

## Non-negotiable decisions (settled in a completed grilling session)

### Command promise and execution

1. Local-only semantics are the command's documented contract (help text + README). **No** per-result disclaimer, no `source`/`githubChecked` fields in output — human or JSON.
2. No installation preflight, no remote discovery, no reconciliation.

### Local-state semantics

3. Absent state file **or** a file with zero stacks → success with human message `No local gh-stack stacks found.` in both compact and verbose modes; JSON returns `ok` with `{ "stacks": [] }`. The two cases are not distinguished.
4. Show **every** recorded stack, including fully-merged ones and stacks with duplicate stack numbers. Inventory reports what the file says; nothing is filtered or deduplicated.
5. One malformed consumed record fails the entire command (typed compatibility failure); no partial inventory. Unknown additive fields and unfamiliar `schemaVersion` values are tolerated (passthrough parsing).
6. Vocabulary is evidence-based: "recorded PR", "recorded merged", "no PR recorded". Never claim `open`, `closed`, or `unpushed` — those require GitHub.
7. Ordering (applies to **both** the JSON `stacks` array and human output): unnumbered stacks first, then numbered stacks descending by stack number, with the stack summary string as the final tie-breaker (ascending `localeCompare`). The stack summary string is the compact-table STACK cell: the single branch name for a one-branch stack, otherwise `<bottomBranch>...<topBranch>`. Unnumbered stacks order among themselves by the same summary tie-breaker. Deterministic.
8. Provider ID (`id` field in local file) is dropped from all output, human and machine. The parser may tolerate it in the file.

### Interface

9. Complete flag surface: `--verbose`/`-v`, plus framework-standard `--format json`, `--json-schema`, `-h`/`--help`. **No `--limit`** and no `limit`/`returned`/`total`/`truncated` metadata — JSON always returns the complete local inventory.
10. Compact default human output — a table with exactly three columns:

```text
NUMBER  STACK                     BASE
—       auth-model...auth-tests   main
42      api-base...api-finish     main
```

One-branch stacks show that branch once (no `...`). No PR details, status, created time, or type column.

11. Verbose human output (`-v`) — per-stack tree, top branch down to base ("Option B" from design review):

```text
42
 ├─ api-finish
 ├─ api-middle
 ├─ api-base
 └─ main (base)

(no number)
 ├─ draft-top
 ├─ draft-base
 └─ main (base)
```

Heading is the stack number or `(no number)`. The base gets the `(base)` suffix and the `└─` connector. Human output carries no PR details in either mode.

12. Machine result data (Clinkr wraps it in the canonical envelope; publish via `resultSchema`/`--json-schema`):

```ts
{
  stacks: Array<{
    number: number | null;
    base: string;
    branches: Array<{
      name: string;
      pullRequest: { number: number; recordedMerged: boolean } | null;
    }>;
  }>;
}
```

Branches stay in the file's stored **bottom-to-top** order; only verbose human rendering reverses them. No `bottomBranch`/`topBranch` convenience fields.

13. `--verbose` combined with `--format json` → `usageError` (exit 2) whose message and structured data name the conflicting flags. JSON is always complete regardless. `--json-schema` is framework-owned schema publication: follow Clinkr's standard handling (schema printed without invoking the handler); do not add custom `--verbose`+`--json-schema` conflict logic.
14. Exactly three failure `errorType` values, partitioned as follows:
    - `git-repository-unavailable` — the current Git repository / common directory cannot be resolved;
    - `gh-stack-state-read-failed` — the state file exists but cannot be read (I/O failure); a missing file is **not** a failure (decision 3);
    - `gh-stack-state-unsupported` — the file's content cannot be interpreted safely: invalid JSON, or any malformed/missing consumed structure, including one malformed record (decision 5).
    The five remote/preflight/reconciliation failure types from the prior implementation do not exist.
15. Names are stable: command `ns gs list`, package `@nseng-ai/gh-stack`. Descriptions must say it inspects **local** gh-stack provider state.

### Architecture

16. One gateway seam: a local stack inventory Consumer Gateway over Git common-dir facts, with a real adapter and a test fake. Plus: local-state Zod schema/parser, a pure normalize/sort core, and the command edge. No installation gateway, no remote gateway/schemas, no `reconcile.ts`.
17. Keep the linked-worktree integration test (common-dir resolution is the one real boundary left).

## Delivery: fresh 3-PR Graphite stack from trunk

Branch names (create with `gt create`; use branch-context attachment guidance if the workflow requires it):

1. **`gh-stack-local-package-scaffold`** — package shell only: `package.json` (name `@nseng-ai/gh-stack`, correct incubating disposition placement, `ns.tier`, dependencies), `tsconfig.json`, workspace/lockfile registration (`ts/pnpm-lock.yaml`), a minimal README stating package intent, and an empty-but-valid `src/` layout with a placeholder export and one trivial test so the package passes the full validation suite. **No** `ns gs` command surface or extension descriptor.
2. **`gh-stack-local-list-implementation`** — all behavior: schema/parser, normalize/sort core, gateway (real + fake), `ns gs list` command with compact/verbose rendering and the JSON contract, extension descriptor activating `ns gs`, source/user extension discovery-registration test updates (the prior branch touched `ts/packages/public/ns/test/integration/source-user-extension-install-host.test.ts`, `ts/packages/public/sdk/test/integration/user-source-extension-registry.test.ts`, `ts/packages/public/sdk/test/integration/source-dev-command-sources.test.ts` — revalidate the current list of inventory tests), scenario tests, linked-worktree integration test.
3. **`gh-stack-local-docs`** — final README (canonical install/quickstart/usage; prerequisites are only Node/ns and a Git repository — drop `gh` auth and the installed extension), rebuilt package `CONTEXT.md` around local-only vocabulary (delete Remote stack / Provider identity / Composition agreement / Strict completeness terms; add recorded-PR and local-only inventory terms), `CONTEXT-MAP.md` registration, and `docs/conventions/stack-provider-capability-matrix.md` updated to state ns ships a local-only read-only gh-stack inspection adapter (Flow still has no gh-stack lifecycle adapter).

Submit with `gt submit --no-interactive` per repo Graphite doctrine (load `code-graphite` skill for mechanics).

## Inherited evidence and revalidation

### Stable inherited evidence (from the prior branch's revalidated provider contract, dated 2026-03-16)

- gh-stack (`github/gh-stack`, pre-1.0, observed `gh stack version 0.1.0`) stores local state as JSON at `<git-common-dir>/gh-stack` with `schemaVersion`, `stacks[]`; each stack: optional `id`, optional positive-int `number`, `trunk.branch`, ordered `branches[]` (bottom-to-top); each branch: `branch` name and optional `pullRequest { number, merged? }`.
- Representative fixture shape (borrowable from `git show gh-stack-inventory-command-activation:ts/packages/incubating/extensions/gh-stack/test/fixtures/local-v1.json`):

```json
{ "schemaVersion": 1, "stacks": [ { "id": "9001", "number": 42,
  "trunk": { "branch": "main" },
  "branches": [ { "branch": "feature-base", "pullRequest": { "number": 101 } },
                { "branch": "feature-top" } ] } ] }
```

- The prior branch's `schemas.ts` local half (Zod passthrough parsing, `merged ?? false` defaulting, absent-`pullRequest` → `null`) is a sound starting point; drop the remote half entirely.

### Revalidate during implementation

- Read the installed provider's current source contract read-only (the user has a local checkout at `/Users/schrockn/code/github/gh-stack`; **never edit it**) or a disposable-repo observation to confirm the local file shape still matches before finalizing the schema. Provider is pre-1.0; drift is plausible.
- The exact set of extension-inventory tests that must enumerate a new extension package (search for existing extension registration tests before assuming the three paths above are complete/current).
- Extension Kit helpers available for Git common-dir resolution and command exec (the prior branch used `createNsGitGateway` and `NsCommandExecApi` from `@nseng-ai/extension-kit`; confirm current exports).

### Explicitly unresolved

- Whether the file's `trunk.branch` is the only base representation (assumed yes).
- Exact wording of help text and the malformed-state failure messages (implementer's judgment within the vocabulary rules above).

## Plan-specific STOP conditions

1. **STOP** if revalidated gh-stack local state is not JSON at `<git-common-dir>/gh-stack` or lacks the structure above — the schema and gateway design assume it.
2. **STOP** if the workflow would require modifying, closing, or force-pushing PR #4271 or branch `gh-stack-inventory-command-activation` — they must remain untouched for comparison.
3. **STOP** if the ns extension loader requires a command descriptor for package validity in PR 1 in a way that would expose any `ns gs` route — scaffold must not activate a user-visible command.
4. **STOP** if Clinkr cannot express the `--verbose`+`--format json` conflict as a handler-returned `usageError` with structured data — do not silently ignore the flag.

## Repo policy pointers (read before coding)

- `ts/AGENTS.md` and `ts/packages/README.md` (disposition tree, `ns.tier`, test lanes, style-guard bans).
- `skills/internal/agent-engineering/ns-cli-design/SKILL.md` + its `references/checklist.md` (hard gates: Clinkr envelope, `-h`/`--version`/`--runtime` scenario coverage, stdout/stderr discipline, camelCase properties, kebab-case errorType values; this command is Tier 0 read-only).
- `docs/conventions/consumer-gateways-and-command-shape.md` before declaring the gateway.
- `docs/conventions/platform-and-consumer.md` (this is a platform package under `ts/packages/`).

## Validation guidance

Per PR: `just` (default repo gate). Use `just ts-format-fix` / `just ts-lint-fix` / `just dprint-fix` for autofixable failures. Run `just ts-test-integration` for the linked-worktree test lane and `just ts-test-typescript-style-guard` in PR 2 (new architecture/guarded subjects). Manual acceptance from a checkout with gh-stack local state present:

```bash
ns gs list
ns gs list -v
ns gs list --format json
ns gs list --json-schema
ns gs list -v --format json   # must be usageError, exit 2
ns gs list -h
```

Exercise: no state file, empty `stacks`, one-branch stack, unnumbered stack, duplicate numbers, fully merged stack (must still display), malformed record (typed failure, no partial output).

## Intermediate checkpoint strategy

Each PR branch is one reviewable unit; within PR 2, run `ns flow cp` after coherent slices (e.g., schema+core with unit tests green; then gateway+adapters; then command+scenario tests). Do not checkpoint knowingly broken states.

## Subagent orchestration opportunities

- PR 2 splits into two sequential editing subagent tasks with clear file ownership if desired: (a) core+schema+gateway with unit tests, (b) command edge, descriptor, discovery-test updates, scenario tests. Dispatch sequentially in one worktree; parent reviews each diff, runs targeted checks, and owns `ns flow cp` unless the prompt delegates it. Inherit routing (no `routing: "cheap"` for editing work).
- A read-only explorer is useful early in PR 2 to enumerate the current extension-discovery/inventory tests that must register a new extension package.
- PRs 1 and 3 are small enough to do directly.

## Closeout review plan

After implementation and focused validation pass, run exactly one in-session `typescript-style` review subagent on the changed diff (review-only; use the review definition's `default_model` if available — e.g., Pi/OpenAI `openai-codex/gpt-5.6-luna:medium`). Remediate only local/mechanical findings, rerun focused validation, report judgment calls. Trust-nothing closeout: rerun `just`, compare changed files against the in-scope list (new package, discovery tests, docs files in PR 3) and out-of-scope list (PR #4271 branch, `/Users/schrockn/code/github/gh-stack`, Flow packages, Extension Kit promotions — all untouched), and read new test assertions for meaningful coverage (especially: fully-merged stacks displayed, duplicate numbers displayed, malformed-record hard failure, verbose/JSON conflict).
