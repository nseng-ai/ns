# TS Scaffold, Shared Helpers, CLI Surfaces & CI Cutover (Slices 1, 7, 8, 9)

Reference package: `ts/packages/pr-address`. Workspace: pnpm rooted at `ts/`
(`pnpm-workspace.yaml` globs `packages/*` — a new `ts/packages/roaster/` auto-registers). Node
`>=24.12.0`, `type: module`, no build step (source `.ts` exports). Tests: Vitest
(`ts/vitest.config.ts`, `include: packages/*/test/**/*.test.ts`), run via `just ts-test` /
`just ts-check`.

## 1. package.json
```json
{
  "name": "@asdl/roaster",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "files": ["src"],
  "bin": { "roaster": "./src/cli.ts" },
  "scripts": {
    "check": "tsc --noEmit -p tsconfig.json",
    "test": "cd ../.. && vitest run --config vitest.config.ts packages/roaster/test"
  },
  "dependencies": {
    "@asdl/clinkr": "workspace:*",
    "@asdl/core": "workspace:*",
    "zod": "^4.4.3",
    "yaml": "^2.9.0",
    "smol-toml": "^1.6.1"
  }
}
```
(pr-address itself needs only the first three deps; `yaml`/`smol-toml` are roaster-specific.)

## 2. tsconfig.json (verbatim, 4 lines)
```json
{ "extends": "../../tsconfig.json", "include": ["src/**/*.ts", "test/**/*.ts"] }
```
Base enforces `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `NodeNext`,
`verbatimModuleSyntax`, `erasableSyntaxOnly`, `allowImportingTsExtensions`, `noEmit`. → use
`import type` and `.ts` import extensions everywhere.

## 3. CLI entry (`cli.ts`) — copy pr-address shape
- Line 1 shebang `#!/usr/bin/env node`; entry guard
  `if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) { process.exitCode = await runCli(process.argv.slice(2)); }`.
- `buildCli(operations?) -> ClinkrGroup<RoasterExecContext>`: root group `{name:"roaster",
  description, version:"0.1.0", runtimeInfo}` + hidden subgroup
  `new ClinkrGroup({name:"exec", description, isHidden:true})`; mount review ops on root and exec ops
  on the exec group; `root.group(execGroup)`.
- `runCli(args, deps={}) -> Promise<number>`: resolve IO, operations, `context` (default
  `createRealRoasterContext()`), cwd, env, stdin (`readStdin` from `@asdl/core`); build
  `RoasterExecContext {context, cwd, env, stdin}`; `return buildCli(operations).run(args, {context,
  io})`. `CliDeps` exposes every field optional — the test seam.
- `index.ts`: `export { runCli, type CliDeps } from "./cli.ts";`.

## 4. clinkr APIs (`ts/packages/clinkr/src/`)
- `new ClinkrGroup<TContext>({name, description?, isHidden?, version?, runtimeInfo?})`; `version`/
  `runtimeInfo` root-only.
- `.command(spec)` (chainable). `ClinkrCommandSpec {name, description?, schema: z.ZodObject,
  handler(ctx, request: z.output<schema>): Promise<ClinkrExit<T>>, resultSchema?, renderHuman?,
  renderMarkdown?, schemaDocument?, positionals?, options?}`. Input surface (options/positionals,
  requiredness, usage errors) derived from the Zod schema.
- `RawCommandSpec` variant bypasses the envelope (raw exit code) — use for the stdin-streaming
  `exec` ops.
- `.group(child)` mounts a subgroup; `isHidden` only suppresses help (still invocable).
- Exits: `ok(data)` / `negative(message, data?)` / `failure(errorType, message)`. Under
  `--format json`: envelope `{exit_code:0|1|2, error_type?, message?, data?}`; ok→0, negative→1,
  failure→2. `envelopeJsonText` reproduces Python `json.dumps(indent=2, ensure_ascii=True)`
  byte-for-byte (key order load-bearing). **The CI `discover` job `jq`-parses `.data.keys`/
  `.data.count` from this envelope.**

## 5. asdl-core TS helpers (`ts/packages/asdl-core/src/`)
- **exec** (`exec.ts`): inject `interface CommandExecApi { exec(command, args, options?):
  Promise<ExecResult> }`; real adapter `class NodeCommandExecApi`. `ExecResult {stdout, stderr, code,
  killed, startupError?}`; `ExecOptions {cwd?, env?, timeout?, signal?, onStdout?, onStderr?}`. This
  is what the harness real adapter and the git/diff/github gateways inject.
- **git** (`git/index.ts`): `GitGateway` (interface) + `RealGitGateway(execApi)`. Useful:
  `repoRoot(cwd)`, `trunkBranch(cwd)` (origin/HEAD → main → master — matches Python
  `resolve_trunk_branch`, but does **not** prepend `origin/`; roaster adds `origin/` at diff time).
  **No diff or changed-path helper exists** — roaster must add one (build on `CommandExecApi`; the
  precedent is pr-address `gateways.ts` which shells `git diff … origin/<base>...HEAD`).
- **gh**: asdl-core's `github-pr-gateway.ts` covers only PR description/commit reads — NOT roaster's
  comment/review surface. Build roaster's own (see `04-§1`).

## 6. CLI surfaces being ported (`cli/roaster/review/`, `workflow.py`)

### `review list` (`list_reviews.py`) — alias `ls`
Options: `--applicable` (flag, default false), `--base-ref STR?` (used only with `--applicable`).
Lists catalog keys, parses each definition; when `--applicable`, loads the diff and filters via
`applicableReviewKeys`. **Result `.data` shape (CI contract):**
`{reviews_dir, keys: string[], count: int, reviews: [{key, description, default_model}]}`.

### `review run <key>` (`run.py`)
Positional `key`; `--model STR?`; `--base-ref STR?` (defaults to resolved trunk). Delegates to
`workflow.runReviewByKey`. Progress to **stderr**. `ok` payload (the run envelope CI pipes to exec):
`{review_name, review_path, model, base_ref, payload: FindingsReview, usage, input_coverage}`.

### `workflow.runReviewByKey` (`workflow.py:25-102`) — pure orchestration over gateways
1. `catalog.loadReviewSource(key)` → failure short-circuits.
2. `parseReviewDefinition(source, {name: key})` → invalid → failure.
3. Resolve model: explicit `--model` → frontmatter `default_model` → else `ModelNotProvided`
   failure (no hardcoded default).
4. `diff.loadDiff({baseRef})` → `BaseRefUnavailable`/diff failure short-circuits.
5. Progress callback with `{review_name, model, base_ref, changed_path_count}`.
6. `harness.runReview(HarnessReviewRequest{model, reviewDefinition, target:{localDiff}})` →
   non-success short-circuits.
7. Build the `LocalReviewResult` run envelope.

### local-diff gateway (`gateways/local_diff/real.py`) — what to replicate
repoRoot via toplevel; base-ref = trimmed `--base-ref` else `trunkBranch`, empty →
`BaseRefUnavailable`; read `roaster.diff.exclude` from asdl project config; diff =
`git diff --no-ext-diff origin/<base>...HEAD` + (if excludes) `-- . :(exclude,glob)<pat>…`;
non-zero exit → `GitDiffFailed`; success → `LocalDiff{baseRef, diffText}` (derive `changedPaths`).

## 7. Test layout (mirror pr-address `test/`)
```
test/
  scenario/   # CLI via runCli: review list/run, exec ops, help/version/runtime bytes, envelope→exit
  unit/       # all the pure-fn ports (diff/review-def/applicability/config/cap/inline/publication)
  gateways/   # Real* adapters (may use temp dirs / real git)
  support/    # run-scenario.ts harness + in-memory fakes (fakeRoasterContext)
```
Scenario tests build the CLI via `runCli(args, {context: fakeRoasterContext(...), cwd, env, stdin,
stdout, stderr})` and assert on captured stdout/stderr + exit code. Per the repo CLI-testing
convention, scenario tests use `build_cli()` (the user-facing entry), exhaustively cover the
standalone CLI, and include `--version`/`-h`. Add a `node-runtime-cli.test.ts` that `spawnSync`s the
shebang source.

## 8. CI cutover (`.github/workflows/roaster.yml`) — VERIFIED contract

Two jobs. `discover` (resolves `BASE_REF` via `gh pr view … --json baseRefName`):
```bash
output=$(uv run roaster review list --applicable --base-ref "$BASE_REF" --format json)
reviews=$(printf '%s' "$output" | jq -c '.data.keys')   # array of keys → matrix
count=$(printf '%s' "$output" | jq '.data.count')
```
`review` (matrix over keys; installs `@anthropic-ai/claude-code` globally; `ANTHROPIC_API_KEY`,
`GH_TOKEN`, `PR_NUMBER`, `REVIEW_KEY`):
```bash
output=$(uv run roaster review run "$REVIEW_KEY" --base-ref "$BASE_REF" --format json)
printf '%s' "$output" > "$roaster_output_file"

uv run roaster exec post-inline-findings --pr-number "$PR_NUMBER" \
  < "$roaster_output_file" > "$inline_result_file"

uv run roaster exec format-findings-comment \
  --inline-result-file "$inline_result_file" --review-name "$REVIEW_KEY" --base-ref "$BASE_REF" \
  < "$roaster_output_file" \
| uv run roaster exec post-findings-comment \
    --pr-number "$PR_NUMBER" --run-url "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
```

**Cutover requirements (Slice 8):** the TS CLI must preserve, exactly —
- command paths: `roaster review list`, `roaster review run <key>`, `roaster exec
  post-inline-findings|format-findings-comment|post-findings-comment`;
- flags & order as above (`--applicable`, `--base-ref`, `--format json`, `--pr-number`,
  `--inline-result-file`, `--review-name`, `--run-url`);
- stdin/stdout piping: all three exec ops read the prior stage on stdin;
  `post-inline-findings` writes the inline-result to stdout; `format-findings-comment` writes the
  comment body to stdout; `post-findings-comment` reads the body on stdin;
- the `review list --format json` envelope's `.data.keys` (array) + `.data.count` (int) survive
  `jq`.
Only the invocation prefix changes: `uv run roaster …` → the built TS bin (resolve how the runner
installs/invokes the Node CLI; note CI already sets up Node 20 for claude-code — confirm the TS CLI
runs under the workflow's Node, or add a setup step / `pnpm` build/link as the bun→node objectives
established).

**Slice 9 (delete Python):** gated on a green TS CI run on a real PR. Then remove
`packages/roaster`, its `pyproject.toml` workspace membership, `asdl.plugins`/`[project.scripts]`
entries, and any docs/build references. Grep for `roaster` across `pyproject.toml`, `justfile`,
`uv.lock`, `docs/`, `docs-site/`, `.github/` to purge stragglers.
</content>
