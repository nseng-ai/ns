# Harness Consumer Semantics Inventory: Current Behavior and Migration Invariants

**Researched:** 2026-07-10, for Objective `harness-session-generation` (`.ns/objectives/harness-session-generation/objective.md`), executing the roadmap row "Research — Inventory consumer semantics and migration invariants" (`.ns/objectives/harness-session-generation/roadmap.md:11`).
**Question:** what is the exact current behavior of the consumers the unified harness/session/text-generation redesign must migrate — Pi fast draft, Reviews Claude/Codex execution, the direct Pi model generator, and the command execution channels — including authentication assumptions, structured output, usage, cancellation, cleanup, and public surfaces, and which of those behaviors are pinned by tests (the de facto compatibility contract), which are candidates to change deliberately, and which are undefined today.
**Method:** read-only inventory of repo source and tests at branch `add-harness-session-text-generation` (HEAD `6437da397`); workspace greps for importers; no probes and no edits outside this report. Every claim cites `path:line`.
**Companion artifact:** `docs/research/claude-codex-isolated-generation-guarantees.md` (CLI-flag guarantees, probe-confirmed). This report cross-references it and does not re-derive its flag findings. Two of its results bind directly here: Claude Code `--bare` never reads OAuth/keychain, so the Reviews Claude runner implicitly requires caller-supplied `ANTHROPIC_API_KEY` (companion doc §"Reviews Claude runner"), and today's Pi fast-draft `claude-cli` path leaks project+user CLAUDE.md ambient context (companion doc §"Pi fast draft").

---

## TL;DR — the load-bearing findings

1. **There are four distinct first-party text-generation surfaces today, plus the Reviews harness-runner seam as a fifth generation-executing surface.** (§4.1.) Two of them — `@nseng-ai/kernel/sdk` `TextGenerator` and `@nseng-ai/capability-kit/text-generation` `TextGenerator` — are byte-for-byte structural duplicates of the same contract (`ts/packages/kernel/src/sdk/text-generation.ts:1-21` vs `ts/packages/capability-kit/src/kit/text-generation.ts:3-23`).
2. **`draftWithFastText` — the module the Objective names as the first steelthread — currently has zero production call sites.** Workspace grep finds only its own definition and a test importing its model-resolution helpers; it is not in the `@nseng-ai/pi` exports map. Its historical callers (checkpoint `/cp`, `/changes`) were migrated to the kernel `TextGenerator` (commits `dd48b9d20`, `5c1bf8fb2`). The `claude-cli` subprocess path is live reference code, not live production code. (§1.7.)
3. **The Reviews runners' exact CLI argv, stdin conventions, parse taxonomy, and cleanup ordering are pinned hard by fake-driven tests** — `ts/packages/capabilities/reviews/test/gateways/review-runner.test.ts:187-212` pins the Claude argv including `--bare`, and `ts/packages/capabilities/reviews/test/unit/codex-review-runner.test.ts:49-71` pins the full Codex argv. Migrating Reviews means either satisfying these tests through the new seam or rewriting them deliberately.
4. **Cancellation is a contract gap everywhere.** The failure codes `review-execution-cancelled` and `review-execution-blocked` are declared but produced nowhere (`ts/packages/capabilities/reviews/src/core/failures.ts:30-31`; grep finds no producer). An `AbortSignal` abort in `runCommand` surfaces as a child `error` event → `startupError` + exit 127 (`ts/packages/infra/foundation/src/exec/index.ts:155-159`), which the Reviews runners map to `harness-invocation-failed` — not a cancellation code — and no test pins abort behavior on any consumer.
5. **The `ns`-hosted exec channel silently drops `env` and `signal`.** `NsCommandExecApi.convertExecOptions` forwards only `timeoutMs`/`stdin`/`onStdout`/`onStderr` (`ts/packages/capability-kit/src/kit/command-runner.ts:38-46`) because `NsExecOptions` has no env/signal fields (`ts/packages/kernel/src/sdk/execution.ts:15-21`), and it refuses any cwd other than `ctx.cwd` (`ts/packages/capability-kit/src/kit/command-runner.ts:47-58`). Reviews under `ns reviews run` therefore cannot thread a per-call env or a cancellation signal to the harness child today.

---

## 1. Pi fast draft (`draftWithFastText`)

Source: `ts/packages/hosts/pi/src/kit/shared/fast-text-draft.ts`. Tests: `ts/packages/hosts/pi/test/fast-text-draft.test.ts`.

### 1.1 Harness and model selection

- Harness env var `PI_DRAFT_HARNESS`, default `"codex-pi"` (`fast-text-draft.ts:16-17`). `selectDraftHarness()` reads `process.env` directly (global read, not injected env) and accepts only `codex-pi` or `claude-cli`; anything else returns `{ error: "Invalid PI_DRAFT_HARNESS=... Valid values: codex-pi, claude-cli." }` (`fast-text-draft.ts:93-102`). **The default fast-draft path is the direct Pi model call, not the Claude CLI** — `claude-cli` is opt-in.
- Model env var `PI_DRAFT_MODEL` (`fast-text-draft.ts:18`), interpreted differently per harness:
  - **codex-pi:** `resolveCodexDraftModel(env)` (`fast-text-draft.ts:104-130`). Unset/blank → `CODEX_DEFAULT_CONFIG` built from `DEFAULT_FAST_MODEL` = `openai-codex/gpt-5.4-mini` (`fast-text-draft.ts:85-91`; `ts/packages/infra/foundation/src/primitives/model-slug.ts:6-10`), label `"gpt-5.4-mini via Codex"`, authLabel `"Codex"`, reasoning `"minimal"`. A set value must be a qualified `provider/modelId` ref (`resolveModelRef`, `model-slug.ts:113-127`); an invalid ref (e.g. bare `fast-1`, `acme/`) **falls back to the default and returns a warning string** that the caller surfaces via `ctx.ui.notify(..., "warning")` (`fast-text-draft.ts:113-118`, `:142-145`). authLabel is `"Codex"` only when provider equals the default provider, otherwise the provider name (`fast-text-draft.ts:126`).
  - **claude-cli:** `resolveClaudeCliDraftModel(env)` returns the trimmed override verbatim or the default `claude-haiku-4-5` (`fast-text-draft.ts:19`, `:132-134`). No validation at all — any string is passed to `claude --model`.

### 1.2 Invocation mechanics — codex-pi path

`draftWithPiModel` (`fast-text-draft.ts:151-175`) calls `callPiModelText` (§4.2) with: registry `ctx.modelRegistry`, provider/modelId from the resolved config, caller's system prompt and user prompt, `maxTokens: input.maxTokens ?? 512` (`fast-text-draft.ts:23`, `:163`), `reasoning: "minimal"`, `timeoutMs: 120_000` (`fast-text-draft.ts:165`). **No `AbortSignal` is passed** — cancellation is timeout-only even though `callPiModelText` supports a signal (`ts/packages/hosts/pi/src/kit/models/call.ts:36`).

Error mapping (`piModelDraftError`, `fast-text-draft.ts:177-194`), keyed on `callPiModelText`'s five failure reasons:

| reason              | user-facing message                                                          |
| ------------------- | ---------------------------------------------------------------------------- |
| `model-unavailable` | `Could not find Pi model <provider>/<modelId>.`                              |
| `auth`              | `<authLabel> auth failed: <message ?? "unknown auth error">`                 |
| `empty-auth`        | `No <authLabel> auth found for <provider>. Run /login or configure Pi auth.` |
| `aborted`           | `<label> failed to draft a <taskNoun>: <message ?? "aborted">`               |
| `request-failed`    | `<label> failed to draft a <taskNoun>: <message ?? "error">`                 |

Empty-output rejection: a successful call whose trimmed text is empty returns `{ error: "<label> returned an empty <taskNoun>." }` (`fast-text-draft.ts:171-173`).

### 1.3 Invocation mechanics — claude-cli path

`draftWithClaudeCli` (`fast-text-draft.ts:196-240`):

- Creates `mkdtemp(join(tmpdir(), "pi-draft-"))`, writes `system-prompt.txt` and `user-prompt.txt` into it (`fast-text-draft.ts:202-207`).
- Executes through the injected Pi host capability `pi.exec("bash", [...])` — command: `bash -lc 'env -u CLAUDECODE claude -p --model "$1" --output-format text --system-prompt "$(cat "$2")" < "$3"' bash <model> <systemPromptPath> <userPromptPath>` with `{ cwd: ctx.cwd, timeout: 120_000 }` (`fast-text-draft.ts:214-225`). Notes:
  - `bash -lc` is a **login shell**, so the user's profile is sourced before `claude` runs (PATH, aliases-adjacent env mutations apply).
  - `env -u CLAUDECODE` un-nests from a parent Claude Code session; nothing else in the environment is controlled — the child inherits the whole Pi host env.
  - cwd is the project directory, and no isolation flags are passed — this is the invocation the companion doc probe-confirmed to leak project CLAUDE.md/AGENTS.md and user `~/.claude/CLAUDE.md`, and to persist a session transcript (companion doc §"Pi fast draft").
  - Temp files exist because the Pi host `pi.exec` channel has no stdin support (§5.3); the shell reads them via `$(cat ...)` and stdin redirection.
- Exit `code !== 0` → error via local `formatCommandError` (`fast-text-draft.ts:227-234`, `:309-318`): summary line + `exit <code>[ (killed or timed out)]: <stderr-or-stdout trimmed>`. The `killed` flag from the host result is the only timeout/kill signal surfaced.
- Exit 0 → **returns `{ output: result.stdout }` with no empty-output check and no trim** (`fast-text-draft.ts:236`) — the empty-output rejection exists only on the codex-pi path. Asymmetry.
- Cleanup: `finally { await rm(tempDir, { force: true, recursive: true }) }` (`fast-text-draft.ts:237-239`) — unconditional on success, error, and throw. Any Claude-side residue (session transcript, history) is not cleaned.

### 1.4 Authentication assumptions

- **codex-pi:** auth comes from the injected Pi model registry — `registry.getApiKeyAndHeaders(model)` (`ts/packages/hosts/pi/src/kit/models/call.ts:44`), i.e. Pi's own AuthStorage-managed credentials (Codex OAuth for `openai-codex`). Missing/empty key is an explicit `empty-auth` failure, surfaced as "Run /login or configure Pi auth."
- **claude-cli:** implicit and ambient — whatever login state the user's `claude` binary resolves under the inherited environment (native OAuth/keychain, or `ANTHROPIC_API_KEY` if present in the host env). Nothing in the code selects or pins the auth mode.

### 1.5 UI coupling

`withSpinner` (`fast-text-draft.ts:242-282`) renders a 10-frame braille spinner at 120 ms via `unrefTimerScheduler` (`ts/packages/hosts/pi/src/kit/shared/timers.ts:17-35` — unref'd so it never keeps the host alive), through `withSafePiUi` so a torn-down Pi UI marks the spinner stale and stops rendering rather than throwing (`fast-text-draft.ts:260-266`). Progress goes to `ctx.ui.setWidget(key, ..., { placement: "aboveEditor" })` when available, else themed `ctx.ui.setStatus` (`fast-text-draft.ts:284-292`); both are cleared in `finally` (`fast-text-draft.ts:274-281`). This UI coupling (spinner key, progress message factory, taskNoun in error strings — `FastTextDraftInput`, `fast-text-draft.ts:67-75`) is part of the module's current shape but is presentation, not generation semantics.

### 1.6 Test coverage shape

`ts/packages/hosts/pi/test/fast-text-draft.test.ts` pins **only model resolution**: codex default when env unset (`:12-17`), full-ref override (`:19-25`), warn+fallback for bare modelId and invalid ref (`:27-41`), blank-as-unset (`:43-49`), claude-cli default and trimmed override (`:52-62`). **Nothing pins**: harness selection, either execution path, error mapping, the empty-output rejection, temp-file lifecycle, spinner behavior, or the exact `bash -lc` command line.

### 1.7 Public surface and callers

Exported symbols: `HARNESS_ENV`, `DEFAULT_HARNESS`, `DRAFT_MODEL_ENV`, `CLAUDE_CLI_MODEL`, `DraftHarness`, `ExtensionCommandContext`, `ExtensionAPI`, `FastTextDraftInput`, `PiModelConfig`, `selectDraftHarness`, `resolveCodexDraftModel`, `resolveClaudeCliDraftModel`, `draftWithFastText` (`fast-text-draft.ts:16-149`). The module is **not** in the `@nseng-ai/pi` package exports map (`ts/packages/hosts/pi/package.json:6-39` has no `./shared/fast-text-draft` entry). Workspace grep for `draftWithFastText` / `fast-text-draft` across `ts/`, `.pi/`, `.ns/` finds only the definition and the test. The historical consumers were migrated off it: commit `dd48b9d20` ("Migrate checkpoint flow ... replace Pi-specific harness with model-agnostic TextGenerationGateway") and `5c1bf8fb2` ("Move /code:changes into built-in SDL changes"). The `PI_DRAFT_MODEL` env name survives as `LEGACY_CHANGES_MODEL_ENV` in capability-kit (`ts/packages/capability-kit/src/kit/text-generation.ts:32`), pinned by `ts/packages/capabilities/flow/test/scenario/changes-command.test.ts:122-130`.

**Consequence for the steelthread:** "migrate Pi fast draft" concretely means (a) this module is the only in-repo implementation of Claude-CLI-backed ordinary text generation and is the behavior the isolated profile replaces, and (b) the live "fast text" consumers to serve are the `TextGenerator`-based flows (§4.4), whose selection helpers still honor `PI_DRAFT_MODEL` for `/changes`.

---

## 2. Reviews Claude execution

Sources: `ts/packages/capabilities/reviews/src/gateways/review-runner.ts`, `claude-code-review-runner.ts`, `review-runner-prompt.ts`, `review-findings-output.ts`; orchestration `src/operations/review-run.ts`; routing `src/core/review-model-reference.ts`; wiring `src/core/context.ts`, `src/core/api.ts`, `src/ns/context.ts`.

### 2.1 Qualified model reference routing

`resolveReviewsModelReference` (`review-model-reference.ts:18-64`): trims the reference; empty → `model-not-provided`; parses `provider/modelId` via `parseModelRef` (`model-slug.ts:44-53`) and additionally rejects untrimmed components and empty modelId path segments (`review-model-reference.ts:30-36`). Provider routing is a closed switch: `anthropic` → harness `claude-code`; `openai` and `openai-codex` → harness `codex`; anything else (including bare aliases like `haiku`, and `google/...`) → `model-not-supported-by-harness` (`review-model-reference.ts:39-63`). No inference, no fallback (also documented at `README.md:51-56`).

`RoutingReviewRunner.runReview` (`review-runner.ts:57-85`) resolves the reference, assembles the prompt once (shared by both harnesses), and dispatches a `PreparedReviewHarnessRequest`:

```
{ modelId, promptText, inputCoverage }   // review-runner.ts:39-43
```

Only the **model ID** crosses to the harness; the full qualified reference is retained upstream in progress/results/logs (`review-run.ts:106-134`; pinned by `test/unit/review-run.test.ts:119`). Routing and reference-identity are pinned by `test/gateways/review-runner.test.ts:264-307`.

Model defaulting above the router: profile `quick`/`deep` from request override or definition (`review-run.ts:224-247`; unknown profile → `review-definition-invalid`), model from request `--model` override or `ns.toml` `[reviews.model_profiles]` (`review-run.ts:240`; repo profiles at `README.md:45-49`; package fallbacks `DEFAULT_REVIEWS_MODEL_PROFILES`, `review-run.ts:303`).

### 2.2 Exact invocation

Binary: literal `"claude"` (`review-runner.ts:24`) resolved through `binaryResolver` (default `defaultCommandResolver`, PATH walk with X_OK check — `ts/packages/infra/foundation/src/exec/index.ts:166-191`). Resolver throw → `harness-invocation-failed`; `undefined` → `harness-binary-missing` with message `"Claude Code binary 'claude' was not found on PATH."` (`review-runner.ts:153-167`).

Argv (`buildClaudeCodeArgs`, `claude-code-review-runner.ts:18-36`):

```
-p --output-format json --bare --tools Bash,Read --model <modelId>
--system-prompt <systemPromptFindings()> --json-schema <inline JSON schema>
```

- The system prompt is the asset `src/gateways/prompts/review_system_findings.md` trimmed (`review-runner-prompt.ts:19-21`, `:147-149`): a CI PR-diff reviewer instructed to emit findings by calling the StructuredOutput tool exactly once, with read-only Read/Bash repo access, no tests/installs/mutations.
- The JSON schema is passed **inline as an argv element** (`claude-code-review-runner.ts:33-35`), derived from `reviewFindingsPayloadSchema` via `z.toJSONSchema(..., { io: "output" })` with `$schema` deleted because "Claude omits structured output when this URI is present" (`review-findings-output.ts:15-23`). Ref-free schema shape pinned by `test/unit/review-runner-prompt.test.ts:229-236`.
- The review prompt goes on **stdin** (`ExecOptions.stdin = request.promptText`, `review-runner.ts:174-179`), never argv — pinned including a 200 KB prompt not appearing in argv (`test/gateways/review-runner.test.ts:176-212`, which also pins the exact first eight argv items, absence of `Edit`/`Write`/`--verbose`/`--append-system-prompt`, and `cwd`).
- cwd = `RunReviewOptions.cwd` (repository working directory — repository awareness is intentional; the model has Bash,Read against the repo).

Prompt assembly (`assembleReviewPrompt`, `review-runner-prompt.ts:48-69`): named-template render of `review_prompt.md` with review name/description/instructions, review dir, base ref, changed-path count, optional prior-findings convergence context (`:90-133`), changed-path list capped at 200 with an omission note (`:12`, `:77-88`), and the diff in a collision-proof backtick fence (`:71-75`, `:151-157`). The diff itself is capped by `promptSizedDiff` at 90 000 prompt tokens / 40 000 per file, producing `inputCoverage` and an in-diff header listing omissions (`review-runner-diff-cap.ts:9-10`, `:17-83`). All pinned by `test/unit/review-runner-prompt.test.ts:25-226` and `test/unit/review-runner-diff-cap.test.ts`.

### 2.3 Output parsing and structured findings

`parseClaudeCodeReviewOutput` (`claude-code-review-runner.ts:38-76`), operating on stdout:

| condition                                                            | failure code                                                                                                                                                                                 |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| blank stdout                                                         | `review-execution-empty-output` (`:42-47`)                                                                                                                                                   |
| stdout not valid JSON                                                | `review-execution-invalid-json` (`:108-117`)                                                                                                                                                 |
| event array containing a non-object                                  | `review-execution-invalid-response` (`:79-87`)                                                                                                                                               |
| event array without a `type:"result"` event                          | `review-execution-invalid-response` (`:88-96`)                                                                                                                                               |
| top-level JSON not object/array                                      | `review-execution-invalid-response` (`:99-104`)                                                                                                                                              |
| result event without `structured_output`, with prose `result` string | `review-execution-invalid-response`, message embeds the prose truncated to 500 chars + "Confirm --json-schema is honored by the installed Claude Code binary." (`:64-70`, `:12`, `:147-151`) |
| result event with neither                                            | `review-execution-invalid-response` (`:72-75`)                                                                                                                                               |
| `structured_output` present but not matching the findings schema     | `review-execution-invalid-findings` (`review-findings-output.ts:31-37`)                                                                                                                      |

Both a single result object and an event array (selecting the `type:"result"` event) are accepted (`claude-code-review-runner.ts:52-62`, `:78-106`). The findings payload schema is strict `{ findings: [{ path: string|null (non-blank), line: positive int|null, severity: info|warning|error, summary, details }] }` (`ts/packages/capabilities/reviews/src/core/models.ts:74-90`). All rows above pinned by `test/unit/claude-code-review-runner.test.ts:43-135`.

### 2.4 Usage extraction

`usageFromResultEvent` (`claude-code-review-runner.ts:119-145`): reads `usage.input_tokens/output_tokens/cache_creation_input_tokens/cache_read_input_tokens` plus result-event `total_cost_usd`, `duration_ms`, `num_turns`, validated by a strict zod object (`reviewUsageSchema`, `models.ts:105-116`). **Any malformed field degrades usage to `null` without failing the findings** (pinned: `test/unit/claude-code-review-runner.test.ts:106-117`). Usage rides on `ReviewExecutionResponse { payload, usage, inputCoverage }` (`models.ts:207-214`) into run results and review logs (`review-run.ts:202-222`).

### 2.5 Execution failure taxonomy (process level)

In `ClaudeCodeProcessReviewRunner.runReview` (`review-runner.ts:149-203`):

- `execApi.exec` throw → `harness-invocation-failed` (`:180-187`).
- `result.startupError !== undefined` → `harness-invocation-failed` with the startup error text (`:189-191`).
- `result.code !== 0 || result.killed` → `harness-execution-failed`; message = trimmed stderr if non-empty, else **last stdout line**, else `"Claude Code exited with status <code>[ after being killed or timed out]."` (`:192-197`, `:206-217`). Stderr precedence pinned (`test/gateways/review-runner.test.ts:226-242`).

### 2.6 Env/cwd/signal threading and auth

`RunReviewOptions = { cwd, env?, signal? }` (`review-runner.ts:26-30`) is built by `environmentOptions(ctx.runScope)` from the Reviews context (`review-run.ts:115-124`; `context.ts:126-131`), i.e. the whole caller env. Entry points:

- **Library/client path:** `createReviewsClient` defaults env to `process.env` (`api.ts:121-139`) and wires `NodeCommandExecApi` (`context.ts:87-102`), so env, stdin, and signal all genuinely reach `spawn`.
- **`ns reviews` command path:** `createNsReviewsRuntime` wraps the host `ctx.exec` in `NsCommandExecApi` (`src/ns/context.ts:10-22`), which **drops `env` and `signal`** and refuses non-`ctx.cwd` cwds (§5.2). The child instead inherits the kernel context env (`ts/packages/kernel/src/cli/context.ts:59-67`), which is the same values today, so the env drop is currently benign-but-fragile; the signal drop means no cancellation on this path.

Auth: the runner sets no auth explicitly. Because the argv includes `--bare`, Claude Code will never read OAuth/keychain (companion doc TL;DR #1); the run works only when the effective child env carries `ANTHROPIC_API_KEY` (or apiKeyHelper via `--settings`, which the runner does not pass). Documented as a requirement at `README.md:58`; CI supplies `secrets.ANTHROPIC_API_KEY`-backed env and pins CLI versions `@anthropic-ai/claude-code@2.1.205` + `@openai/codex@0.144.0` (`.github/workflows/reviews.yml:104-117`). **No code or test enforces the key's presence — a missing key surfaces as a generic `harness-execution-failed` with the CLI's "Not logged in" stderr.**

### 2.7 Cleanup and timeout

The Claude runner creates **no temp artifacts** (schema inline in argv, prompt on stdin) — nothing to clean. It also passes **no timeout** (`review-runner.ts:174-179` sets none), so a hung CLI runs until the caller's signal (when threaded) or forever. It passes none of the session/history-suppression flags, so Claude-side transcript persistence under `~/.claude/projects/<cwd-slug>/` is whatever `--bare` implies — the companion doc does not claim `--bare` suppresses session persistence (companion doc §"Reviews Claude runner", row 6), and no repo test observes it. Undefined today.

### 2.8 Orchestration invariants above the runner

`runReview` (`review-run.ts:90-148`): applicability-filtered diff (`:100`; pinned `review-run.test.ts:165`), model/profile resolution before dispatch (`:102-104`; unqualified override rejected pre-runner, pinned `:145`), progress carries reviewKey/path/profile/full model ref/baseRef/changedPathCount (`:106-113`), runner failure → outcome `failed` **without writing a review log** (`:125`; pinned `:282`), log-write-only failure → `completed_log_failed` with the completed result preserved (`:140-145`; pinned `:308`). Default wiring `RoutingReviewRunner{ClaudeCodeProcessReviewRunner, CodexProcessReviewRunner}` pinned by `test/unit/context.test.ts:164-176`.

---

## 3. Reviews Codex execution

Sources: `ts/packages/capabilities/reviews/src/gateways/codex-review-runner.ts`, `codex-review-output-files.ts`. Tests: `test/unit/codex-review-runner.test.ts`.

### 3.1 Binary resolution

Literal `"codex"` (`codex-review-runner.ts:25`) via the same `CommandResolver` seam (default `defaultCommandResolver`): resolver throw → `harness-invocation-failed`, undefined → `harness-binary-missing` `"Codex binary 'codex' was not found on PATH."` (`codex-review-runner.ts:177-191`). A missing binary short-circuits **before** output-file preparation and before any spawn (pinned: `codex-review-runner.test.ts:174-189`).

### 3.2 Output-files lifecycle

`CodexReviewOutputFiles` gateway (`codex-review-output-files.ts:10-14`) with `RealCodexReviewOutputFiles`:

- `prepare(schema)`: `mkdtemp(tmpdir()/ns-reviews-codex-)`, writes `findings.schema.json` (JSON-stringified findings schema, same `$schema`-stripped builder as Claude — `codex-review-runner.ts:53`, `review-findings-output.ts:15-23`), reserves `findings.json` as the output path (`codex-review-output-files.ts:17-25`). A schema-write failure removes the directory and rethrows, preserving the original error (`:26-33`); the runner maps prepare failure to `harness-invocation-failed` (`codex-review-runner.ts:54-59`).
- `readOutput(handle)`: reads `findings.json` (`:36-38`); a read failure maps to `review-execution-empty-output` with the underlying message (`codex-review-runner.ts:104-111`) — note this code fires even when the process exited 0.
- `cleanup(handle)`: recursive force-remove of the temp dir (`:40-42`), invoked in a dedicated `try { } catch { /* Temporary artifact cleanup is best effort and must not discard completed model work. */ }` **after** the primary result is computed (`codex-review-runner.ts:71-76`). Pinned exhaustively: cleanup runs on success, on process failure, on read failure; a cleanup failure neither discards a successful review nor masks a primary failure (`codex-review-runner.test.ts:70-172`).

An `InMemoryCodexReviewOutputFiles` fake with scripted prepare/read/cleanup errors is part of the exported surface (`codex-review-output-files.ts:45-93`).

### 3.3 Exact invocation

Argv (`buildCodexArgs`, `codex-review-runner.ts:116-136`):

```
exec --model <modelId> --sandbox read-only --ephemeral --ignore-user-config
--output-schema <schemaPath> --output-last-message <outputPath> --color never -
```

Trailing `-` = prompt from stdin. Stdin convention (`buildCodexPrompt`, `codex-review-runner.ts:138-148`): a `<system-instructions>` block containing the same `systemPromptFindings()` asset, then a `<review-input>` block with the assembled review prompt — the workaround for `codex exec` having no system-prompt flag (companion doc, guarantee row 9). ExecOptions: `cwd`, `stdin`, optional `env`, optional `signal` (`codex-review-runner.ts:86-91`); env and signal object-identity threading pinned (`codex-review-runner.test.ts:91-112`). Full argv, stdin blocks, `$schema` removal, and cleanup pinned (`codex-review-runner.test.ts:29-71`). No timeout is set (same unbounded-run posture as Claude). Note this profile is repository-aware by design and — per the companion doc probe — still reads project `AGENTS.md` (fine for Reviews, disqualifying for isolated generation).

### 3.4 Parse path, usage, failures

`parseCodexReviewOutput(output, inputCoverage)` (`codex-review-runner.ts:150-175`) on the **file contents**, not stdout: blank → `review-execution-empty-output` ("Codex produced no structured output."); invalid JSON → `review-execution-invalid-json`; then the shared `reviewResponseFromFindingsPayload` with **`usage: null` hard-coded** (`codex-review-runner.ts:172`) — the Claude/Codex usage asymmetry is explicit and documented (`README.md:66` "Codex token/cost usage is currently reported as `null`"; pinned `codex-review-runner.test.ts:46`, parse taxonomy `:192-203`). Process-level failures mirror Claude: exec throw → `harness-invocation-failed` (`codex-review-runner.ts:63-69`), `startupError` → `harness-invocation-failed` (`:93-95`), non-zero/killed → `harness-execution-failed` with stderr-precedence message (`:96-101`, `:193-199`).

### 3.5 Auth

Nothing explicit in the runner. `--ignore-user-config` keeps `CODEX_HOME` auth while dropping user config (companion doc TL;DR #2), so local runs use the developer's native Codex login; CI performs `codex login --with-api-key` from `secrets.OPENAI_API_KEY` before running (`.github/workflows/reviews.yml:109-112`) and also exposes `OPENAI_API_KEY` in the run env (`:117`). `README.md:58` states the `OPENAI_API_KEY` requirement for local runs (in practice: any working codex login).

---

## 4. Direct Pi model generation

### 4.1 The surface inventory (how many text-generation contracts exist)

Four distinct first-party surfaces, plus the Reviews seam:

| # | Surface                                             | Contract                                                                                                                                                               | Real impl                                                                                                                                                                                                                                                                                              | Importers (workspace grep)                                                                                                                                                                                                                        |
| - | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | `@nseng-ai/kernel/sdk` `TextGenerator`              | `ts/packages/kernel/src/sdk/text-generation.ts:1-21` (re-exported via `sdk/index.ts:116`); reaches consumers as `NsExtensionApi.textGenerator` (`sdk/execution.ts:48`) | `PiTextGenerator` (`ts/packages/kernel/src/runtime/pi-text-generation.ts:36-124`), constructed by `createTextGenerator()`/`createRealNsCommandContext` (`ts/packages/kernel/src/cli/context.ts:33-35`, `:43`); re-exported by ns-cli (`ts/packages/hosts/ns-cli/src/kernel/pi-text-generation.ts:1-2`) | flow commands `cp`/`submit`/`regenerate-pr`/`changes` and ccc autobranch checkpoint via `ctx.textGenerator` (`ts/packages/capabilities/flow/src/ns/model-generation.ts:7-30`; `ts/packages/capabilities/ccc/src/ns/autobranch/checkpoint.ts:7-9`) |
| 2 | `@nseng-ai/capability-kit/text-generation`          | structurally identical duplicate contract (`ts/packages/capability-kit/src/kit/text-generation.ts:3-23`) + model-selection helpers (`:25-68`)                          | none — contract + env policy only; test fake `ScriptedTextGenerator` (`src/kit/text-generation-testing.ts`)                                                                                                                                                                                            | flow (`pr-description-orchestration.ts:2`, `ns/commands/cp.ts:2`, `ns/commands/submit.ts:35`, `ns/model-generation.ts:3`, `autobranch/checkpoint.ts:9`), ccc (`ns/autobranch/checkpoint.ts:9`)                                                    |
| 3 | `@nseng-ai/pi/models/call` `callPiModelText`        | `ts/packages/hosts/pi/src/kit/models/call.ts:24-39` (discriminated failure reasons)                                                                                    | itself (thin wrapper over pi-ai `completeSimple`)                                                                                                                                                                                                                                                      | internal pi-tools: stack-view `enrichment-engine.ts:25-26`/`extension.ts:17`; pr-previews `extension.ts:7`/`preview-check-logs.ts:4`; and fast draft (`fast-text-draft.ts:10`)                                                                    |
| 4 | `draftWithFastText`                                 | `fast-text-draft.ts:136-149`                                                                                                                                           | itself (two harness paths)                                                                                                                                                                                                                                                                             | **none in production** (§1.7)                                                                                                                                                                                                                     |
| 5 | Reviews `ReviewHarnessRunner`/`ReviewRunnerGateway` | `review-runner.ts:32-50`                                                                                                                                               | Claude/Codex process runners                                                                                                                                                                                                                                                                           | Reviews operations only                                                                                                                                                                                                                           |

The kernel and capability-kit contracts (`TextGenerationRequest { modelRef, system, prompt, maxTokens?, reasoning?: "minimal"|"low", operation? }`, `TextGenerationResult ok/text/usage? | error: string`) are field-for-field identical; the duplication exists so capabilities depend on capability-kit while hosts implement via kernel. `reasoning` is limited to `"minimal" | "low"` on every surface (`kernel sdk text-generation.ts:6`; `capability-kit text-generation.ts:8`; `call.ts:35`).

### 4.2 `callPiModelText` (`ts/packages/hosts/pi/src/kit/models/call.ts`)

- Request: registry (`PiModelRegistryLike { find, getApiKeyAndHeaders }`, `:10-13`), provider, modelId, systemPrompt, userText, required `maxTokens`, required `reasoning`, optional `signal`, optional `timeoutMs`, optional `completeFn` test seam (`:28-39`).
- Auth: `registry.getApiKeyAndHeaders(model)` — Pi's model registry auth (Pi AuthStorage). Failure → `{ reason: "auth", message }`; missing/empty apiKey → `{ reason: "empty-auth" }` (`:44-47`).
- Model lookup miss → `model-unavailable` (`:42-43`).
- Executes pi-ai `completeSimple` (lazy-imported so deterministic extension paths never pay the pi-ai import — `:50`, `:94-98`) with a single user message; response `stopReason === "aborted"` → `aborted`, `"error"` → `request-failed`, each carrying `errorMessage` (`:72-75`); thrown errors → `aborted` if `signal?.aborted` else `request-failed` with the message (`:84-91`). Text = all `text` content parts joined with `\n` (`:76-83`). **No empty-output rejection and no usage capture** — pi-ai's usage data is dropped at this seam.
- Cancellation: caller-supplied `AbortSignal` and/or `timeoutMs` forwarded to pi-ai (`:66-69`). The pi-tools enrichment engine composes `AbortSignal.any([controller.signal, AbortSignal.timeout(...)])` per task (`ts/packages/internal/pi-tools/src/stack-view/enrichment-engine.ts:225-227`), demonstrating the intended cancellation idiom.
- Tests: `ts/packages/hosts/pi/test/pi-model-call.test.ts:78-142` pins all five failure mappings, aborted-signal-on-throw, multi-part text joining, and option pass-through — this surface's taxonomy is the best-pinned of the four.

### 4.3 `PiTextGenerator` (`ts/packages/kernel/src/runtime/pi-text-generation.ts`)

- Request/response: the kernel `TextGenerator` contract; errors are **flat strings**, not discriminated reasons (`:15-17` defaults `maxTokens 512`, `reasoning "low"`, `timeoutMs 120_000` — note the default reasoning differs from fast draft's `"minimal"`).
- Model ref parsed locally (`parsePiModelRef`, `:141-155`; invalid → `Invalid Pi model reference ... Expected provider/model-id.`).
- Registry: injected or lazily `ModelRegistry.create(AuthStorage.create())` from `@earendil-works/pi-coding-agent` (`:162-165`) — **the auth source is Pi's global auth storage**, resolved at generation time inside the kernel process. Error strings mirror callPiModelText semantics: `Could not find Pi model <ref>.`, `Pi auth failed for <ref>: ...`, `No Pi auth found for <provider>. Run /login or configure Pi auth.` (`:54-68`).
- `stopReason error|aborted` → error string; **empty trimmed text is rejected** (`Pi model <ref> returned empty text.`, `:107-109`); thrown errors formatted (`:117-123`).
- **Usage is captured**: `{ inputTokens, outputTokens }` when finite (`:111-116`, `:126-135`) — the only surface that reports usage on the direct path.
- **No cancellation parameter at all**: the contract has no signal field; timeout is fixed at 120 s (`:89`).
- **Test coverage: none.** Grep finds no test importing/instantiating `PiTextGenerator` in kernel or ns-cli tests. Its behavior is pinned only indirectly through flow scenario tests that script the `TextGenerator` interface (`ScriptedTextGenerator`, e.g. `ts/packages/capabilities/flow/test/unit/submit.test.ts:20`).

### 4.4 Model-selection policy (capability-kit)

`ts/packages/capability-kit/src/kit/text-generation.ts:25-68`: per-operation env overrides with defaults — checkpoint `NS_CHECKPOINT_MODEL` (legacy `NS_DEV_CHECKPOINT_MODEL`) → `DEFAULT_FAST_MODEL_REF`; changes `NS_CHANGES_MODEL` (legacy `PI_DRAFT_MODEL`) → `DEFAULT_FAST_MODEL_REF`; submit-failure `NS_SUBMIT_FAILURE_MODEL` → `DEFAULT_FAST_MODEL_REF`; PR description `NS_DEV_PR_DESCRIPTION_MODEL` → `openai-codex/gpt-5.4-mini`. Blank values treated as unset (`:57-68`). Legacy `PI_DRAFT_MODEL` honored end-to-end is pinned by `flow/test/scenario/changes-command.test.ts:122-130`.

---

## 5. Command execution channels

### 5.1 `@nseng-ai/foundation/command` + `@nseng-ai/foundation/exec` (the full-fidelity channel)

Types (`ts/packages/infra/foundation/src/primitives/command.ts`):

- `ExecResult { stdout, stderr, code, killed, startupError? }` (`:7-13`). `startupError` means the process failed to start or died pre-completion; `commandSucceeded` = `code === 0 && !killed` (`:174-176`).
- `ExecOptions { cwd?, env?, timeout?, timeoutKillGraceMs?, signal?, stdin?, onStdout?, onStderr? }` (`:18-27`).
- `CommandExecApi { exec(command, args, options?) }` (`:57-59`) — doc comment: intentionally Pi-`ctx.exec`-compatible, but ns's contract is wider; code relying on stdin must require the branded `StdinCapableCommandExecApi` because "The Pi host `exec` is intentionally NOT branded: it silently drops stdin" (`:49-68`).
- Adapters: `piExecApiToCommandExecApi`/`normalizeExecResult` (`:86-92`, `:147-155`), `runNormalizedExecResult` mapping thrown spawn errors to exit 127 + `startupError` (`:157-172`).

Real Node adapter (`ts/packages/infra/foundation/src/exec/index.ts`):

- `NodeCommandExecApi` implements the stdin brand (`:59-64`); `runCommand` spawns with `shell:false` (`:81-84`), threads cwd/env/signal into `SpawnOptions` (`:85-93`), pipes stdin tolerant of EPIPE (`:141-154`), streams chunk callbacks (`:131-140`).
- Timeout semantics: after `timeout` ms → SIGTERM, then SIGKILL after `timeoutKillGraceMs` (default 5 000 ms); a timed-out run resolves with `code 124`, `killed: true` (`:51-53`, `:114-129`, `:100-111`).
- Spawn/`error` events → `startupError` + exit 127 (`:155-159`); a signal-terminated close sets `killed: true` (`:160-162`). Uses the `TimerScheduler` seam, complying with the ts/AGENTS time-seam rule (`:72`; `ts/AGENTS.md` "Time seams").
- `defaultCommandResolver`: PATH walk with `accessSync(X_OK)` (`:166-191`).
- Pinned by integration tests: stdin piping, streaming, startup error → 127 + `startupError`, SIGTERM timeout, SIGKILL escalation (`ts/packages/infra/foundation/test/integration/exec/exec-run-command.test.ts:27-146`). **AbortSignal behavior is not tested** — the abort→`error`-event→`startupError`(127) interaction is inferred from Node semantics plus `:155-159`, not pinned.
- Test fake: `ScriptedCommandExecApi` (`ts/packages/infra/foundation/src/exec/testing.ts`) records `{ command, args, options }` and replays scripted `{ stdout, stderr, exitCode, startupError, isKilled }` — the fake the Reviews runner tests build on.

**Consumers:** Reviews (default `NodeCommandExecApi`, `reviews/src/core/context.ts:88`), kernel CLI `ctx.exec` (wraps `runCommand`, `kernel/src/cli/context.ts:59-67`), capability-kit git gateway et al.

### 5.2 Kernel `ctx.exec` (`NsExtensionApi.exec`) and the `NsCommandExecApi` adapter (the ns-hosted channel)

- Contract: `NsExecOptions { timeoutMs?, cwd?, stdin?, onStdout?, onStderr? }` → `ExecResult { stdout, stderr, code, killed, startupError? }` (`ts/packages/kernel/src/sdk/execution.ts:7-21`). **No `env`, no `signal`** in the options — env is context-wide (`NsExtensionApi.env`, `:38`).
- Real kernel implementation runs `runCommand` with the context env and the mapped options, and **returns only `{ code, stdout, stderr, killed }` — `startupError` is dropped** at this boundary (`ts/packages/kernel/src/cli/context.ts:59-74`).
- `NsCommandExecApi` adapts `NsExtensionApi` back to `CommandExecApi` for gateway reuse (`ts/packages/capability-kit/src/kit/command-runner.ts:19-29`): `convertExecOptions` forwards timeout (as timeoutMs)/stdin/onStdout/onStderr and **silently discards `env` and `signal`** (`:38-46`); any cwd differing from `ctx.cwd` is refused with a synthetic exit-2 result (`:47-58`). This is the channel `ns reviews run` executes harnesses through (`reviews/src/ns/context.ts:10-22`).

### 5.3 Pi host `pi.exec` / `ctx.exec` (the Pi extension channel)

- Author-facing shape as declared by fast draft's own `ExtensionAPI`: `exec(command, args, options?: { cwd?, timeout? })` → `CommandResult` (`fast-text-draft.ts:60-65`), where `CommandResult = Pick<ExecResult, "code"|"stdout"|"stderr"> & { killed? }` (`ts/packages/capability-kit/src/kit/command-result.ts:3-5`). No env, no stdin (silently dropped — `command.ts:61-68`), no signal, no startupError, no stream callbacks.
- Per `ts/packages/hosts/pi/AGENTS.md` §"Process I/O": extensions must not import `node:child_process`; all process execution goes through injected `pi.exec` or narrow injected functions; the injected host `ctx.exec` result shape lives in `@nseng-ai/kernel/sdk`; `@nseng-ai/pi/shared/exec-gateway` re-exports the foundation types as the `ExecGateway` seam (`ts/packages/hosts/pi/src/kit/shared/exec-gateway.ts:5-7`).

### 5.4 Channel comparison

| capability       | foundation `runCommand`/`NodeCommandExecApi` | kernel `ctx.exec` (+ `NsCommandExecApi`) | Pi `pi.exec`               |
| ---------------- | -------------------------------------------- | ---------------------------------------- | -------------------------- |
| cwd              | yes                                          | yes but adapter refuses ≠ `ctx.cwd`      | yes                        |
| env override     | yes                                          | no (context env only)                    | no                         |
| stdin            | yes (branded)                                | yes                                      | **no (silently dropped)**  |
| AbortSignal      | yes (untested)                               | no                                       | no                         |
| timeout          | yes, SIGTERM→SIGKILL, code 124               | yes (`timeoutMs`)                        | yes (host-owned semantics) |
| startupError     | yes                                          | produced then **dropped** by kernel impl | absent                     |
| stream callbacks | yes                                          | yes                                      | no                         |

Consumer→channel mapping: Reviews→(5.1 default, 5.2 under `ns`); fast draft claude-cli→5.3 (temp files precisely because 5.3 has no stdin); kernel CLI commands→5.2 over 5.1; direct Pi generation→no exec channel at all (network via pi-ai).

### 5.5 Standing seam rules and compliance

- `ts/AGENTS.md`: no raw production timers/wall-clock — inject `Clock`/`TimerScheduler`; `unrefTimerScheduler` for Pi background timers. Compliance: fast draft's spinner uses `unrefTimerScheduler` (`fast-text-draft.ts:250`, `:271`); `runCommand` uses the scheduler seam (`exec/index.ts:72`).
- `ts/packages/hosts/pi/AGENTS.md`: no `node:child_process` in extensions; exec via injected capability. Compliance: fast draft executes only through `pi.exec`; Reviews executes only through the injected `CommandExecApi` gateway with a scripted fake for tests; the Codex output-file gateway isolates filesystem I/O behind an interface with an in-memory fake (`codex-review-output-files.ts:10-14`, `:52-93`). Direct `node:fs/promises` temp-file use in fast draft (`fast-text-draft.ts:6`, `:202-207`) and sync `readFileSync` for prompt assets (`review-runner-prompt.ts:147-149`) are file I/O, not process I/O — not covered by the ban, but the fast-draft temp files have no test seam. No deviations from the child_process rule were found in these consumers.

---

## 6. Migration invariants table

Verdicts: **PRESERVE** (behavior the redesign must keep, with the pinning test), **CHANGE?** (candidate to intentionally change — flagged as decision-needed, not decided here), **UNDEFINED** (no pinning test; contract gap today).

### 6.1 Pi fast draft

| behavior                                                                                                                                   | verdict                                                                                                                  | evidence / pin                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `PI_DRAFT_MODEL` codex-path resolution: default `openai-codex/gpt-5.4-mini`, qualified-ref override, warn+fallback on invalid, blank=unset | PRESERVE                                                                                                                 | `test/fast-text-draft.test.ts:11-49`                                                                                              |
| `PI_DRAFT_MODEL` claude-path: trimmed verbatim override, default `claude-haiku-4-5`                                                        | PRESERVE                                                                                                                 | `test/fast-text-draft.test.ts:52-62`                                                                                              |
| Empty-output rejection (codex-pi path)                                                                                                     | PRESERVE (and extend to all paths — the unified convenience contract requires it, objective.md:15)                       | `fast-text-draft.ts:171-173`; **no test**                                                                                         |
| Five-reason error taxonomy → user messages incl. "Run /login or configure Pi auth."                                                        | PRESERVE semantics (message wording may move)                                                                            | `piModelDraftError` `fast-text-draft.ts:177-194`; taxonomy pinned at the `callPiModelText` layer (`pi-model-call.test.ts:79-142`) |
| claude-cli ambient-context leak (project+user CLAUDE.md, session persistence, full env inheritance, `bash -lc` login shell)                | **CHANGE?** — the Objective's isolated profile explicitly targets this (objective.md:13; companion doc §"Pi fast draft") | probe-confirmed in companion doc; no repo test depends on it                                                                      |
| claude-cli missing empty-output check and untrimmed stdout passthrough                                                                     | **CHANGE?** (asymmetry vs codex-pi path)                                                                                 | `fast-text-draft.ts:236`; untested                                                                                                |
| No AbortSignal on either path; 120 s timeouts                                                                                              | **CHANGE?** (session contract must decide cancellation)                                                                  | `fast-text-draft.ts:165`, `:224`; untested                                                                                        |
| Temp-dir `pi-draft-` unconditional cleanup in `finally`                                                                                    | PRESERVE as a property (unconditional cleanup)                                                                           | `fast-text-draft.ts:237-239`; **no test**                                                                                         |
| `PI_DRAFT_HARNESS` selection incl. invalid-value error                                                                                     | UNDEFINED (no test on `selectDraftHarness`); redesign may replace the env knob — decision-needed                         | `fast-text-draft.ts:93-102`                                                                                                       |
| Spinner/UI coupling (`withSpinner`, widget-or-status, stale-UI tolerance)                                                                  | PRESERVE for callers, but it is presentation — should stay with the Pi caller, not enter the generation seam             | `fast-text-draft.ts:242-307`; untested                                                                                            |
| Public surface: module orphaned, not in exports map, zero production callers                                                               | fact to exploit — deletion is cheap; "first steelthread must demonstrate deletion" (objective.md `Risks`)                | §1.7 greps                                                                                                                        |

### 6.2 Reviews Claude execution

| behavior                                                                                                                                                                     | verdict                                                                                                                                                                                                                               | evidence / pin                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Qualified-ref routing: `anthropic/`→Claude, `openai(-codex)/`→Codex, closed set, empty→`model-not-provided`, else `model-not-supported-by-harness`; no dispatch on rejection | PRESERVE                                                                                                                                                                                                                              | `review-model-reference.ts:18-71`; `test/gateways/review-runner.test.ts:264-307`        |
| Only modelId crosses to the harness; full reference retained in progress/results/logs                                                                                        | PRESERVE                                                                                                                                                                                                                              | `review-runner.ts:73-77`; `review-run.test.ts:119`                                      |
| Prompt on stdin, never argv; system prompt asset; inline `$schema`-stripped JSON schema; `--tools Bash,Read`; cwd = repo                                                     | PRESERVE (schema/prompt/coverage semantics); exact argv is the migration surface itself                                                                                                                                               | `review-runner.test.ts:166-213`; `review-runner-prompt.test.ts:25-236`                  |
| `--bare` + implicit `ANTHROPIC_API_KEY` dependency (no harness-native login)                                                                                                 | **CHANGE?** — flagged decision: the Objective wants harness-managed auth (objective.md:5), and the companion doc shows `--bare` forbids native OAuth; but CI currently supplies API keys and works. Decision-needed, not decided here | companion doc TL;DR #1; `README.md:58`; `.github/workflows/reviews.yml:116-117`         |
| Output parse taxonomy: empty-output / invalid-json / invalid-response (incl. event-array selection, prose-with-guidance truncated to 500 chars) / invalid-findings           | PRESERVE                                                                                                                                                                                                                              | `claude-code-review-runner.test.ts:43-135`                                              |
| Usage: zod-strict 7-field extraction; malformed usage degrades to `null` without failing findings                                                                            | PRESERVE                                                                                                                                                                                                                              | `claude-code-review-runner.test.ts:44-60`, `:106-117`                                   |
| Process failures: binary-missing (no spawn), invocation-failed (throw/startupError), execution-failed with stderr precedence then last-stdout-line                           | PRESERVE                                                                                                                                                                                                                              | `review-runner.test.ts:215-242`                                                         |
| env/signal threading through `RunReviewOptions` (library path)                                                                                                               | PRESERVE                                                                                                                                                                                                                              | pinned for Codex (`codex-review-runner.test.ts:91-112`); Claude side **untested** — gap |
| Runner failure writes no review log; log-only failure preserves completed result                                                                                             | PRESERVE                                                                                                                                                                                                                              | `review-run.test.ts:282`, `:308`                                                        |
| Diff caps 90k/40k + inputCoverage + changed-paths cap 200                                                                                                                    | PRESERVE                                                                                                                                                                                                                              | `review-runner-diff-cap.ts:9-10`; `review-runner-prompt.test.ts:136`                    |
| No timeout on harness runs                                                                                                                                                   | UNDEFINED — decision-needed for the session contract                                                                                                                                                                                  | `review-runner.ts:174-179`                                                              |
| Claude-side session persistence under `--bare` (residue)                                                                                                                     | UNDEFINED — never observed or tested                                                                                                                                                                                                  | companion doc row 6                                                                     |
| Cancellation mapping (abort → `harness-invocation-failed` via startupError, not `review-execution-cancelled`)                                                                | UNDEFINED — `review-execution-cancelled`/`review-execution-blocked` declared but never produced                                                                                                                                       | `failures.ts:30-31`; §TL;DR #4                                                          |
| env/signal dropped on the `ns reviews` path (`NsCommandExecApi`)                                                                                                             | UNDEFINED/latent — currently benign for env, real for signal                                                                                                                                                                          | `command-runner.ts:38-46`                                                               |

### 6.3 Reviews Codex execution

| behavior                                                                                                                                                                     | verdict                                                                                                                                                                                                        | evidence / pin                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Exact argv: `exec --model <m> --sandbox read-only --ephemeral --ignore-user-config --output-schema --output-last-message --color never -`                                    | PRESERVE semantics (read-only, ephemeral, user-config-suppressed, schema-validated file output); argv itself is the migration surface                                                                          | `codex-review-runner.test.ts:49-64`                                                   |
| `<system-instructions>` + `<review-input>` stdin convention, ordering                                                                                                        | PRESERVE (until Codex gains a real system-prompt seam — companion doc "Open questions")                                                                                                                        | `codex-review-runner.test.ts:66-68`, `:205-210`                                       |
| Output read from `--output-last-message` file, not stdout                                                                                                                    | PRESERVE                                                                                                                                                                                                       | `codex-review-runner.test.ts:29-71`                                                   |
| Best-effort cleanup that never discards completed model work nor masks the primary failure; cleanup on success/process-failure/read-failure; missing binary prepares nothing | PRESERVE                                                                                                                                                                                                       | `codex-review-runner.test.ts:70-189`; `codex-review-runner.ts:71-76`                  |
| `usage: null` for Codex                                                                                                                                                      | PRESERVE as documented asymmetry, **CHANGE?** candidate if the unified result contract can capture Codex diagnostics (objective Risks: "lowest-common-denominator result could discard ... Codex diagnostics") | `codex-review-runner.ts:172`; `README.md:66`; pinned `codex-review-runner.test.ts:46` |
| env + signal object-identity threading                                                                                                                                       | PRESERVE                                                                                                                                                                                                       | `codex-review-runner.test.ts:91-112`                                                  |
| Parse taxonomy incl. read-failure → `review-execution-empty-output`                                                                                                          | PRESERVE codes; note the read-failure/empty-output conflation as a possible deliberate rename                                                                                                                  | `codex-review-runner.ts:104-111`; `codex-review-runner.test.ts:114-130`, `:192-203`   |
| Project `AGENTS.md` still read under this profile                                                                                                                            | PRESERVE for Reviews (repository awareness is the point); must NOT carry into isolated generation                                                                                                              | companion doc §"Reviews Codex runner"                                                 |

### 6.4 Direct Pi generation

| behavior                                                                                                                                                  | verdict                                                                                                                      | evidence / pin                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `TextGenerator` request/response contract (modelRef/system/prompt/maxTokens/reasoning/operation → ok/text/usage? or error string) as consumed by flow/ccc | PRESERVE (this is the contract the unified module must keep satisfying — objective.md:32)                                    | contract files §4.1; consumer pins via `ScriptedTextGenerator` (e.g. `flow/test/unit/submit.test.ts:20`) |
| Per-operation model env selection incl. legacy `PI_DRAFT_MODEL` for changes                                                                               | PRESERVE                                                                                                                     | `capability-kit/src/kit/text-generation.ts:25-68`; `flow/test/scenario/changes-command.test.ts:122-130`  |
| `PiTextGenerator` behavior: Pi-registry auth at generation time, empty-text rejection, usage capture, 512/low/120s defaults, flat-string errors           | UNDEFINED — **zero direct tests**; the de facto contract lives only in consumer fakes                                        | §4.3                                                                                                     |
| `callPiModelText` five-reason taxonomy, signal/timeout pass-through, lazy pi-ai import                                                                    | PRESERVE (live consumers: pi-tools stack-view + pr-previews)                                                                 | `pi-model-call.test.ts:79-142`                                                                           |
| Duplicate kernel/capability-kit contract definitions                                                                                                      | **CHANGE?** — consolidation is exactly the "package placement / curated exports" decision the roadmap defers (roadmap row 5) | §4.1                                                                                                     |
| Usage dropped by `callPiModelText`, captured by `PiTextGenerator`, `null` for Codex reviews, rich 7-field for Claude reviews                              | **CHANGE?** — the unified result contract must decide one honest usage story (objective Assumptions #2)                      | §4.2/§4.3/§2.4/§3.4                                                                                      |

### 6.5 Command execution channels

| behavior                                                                                                   | verdict                                                                                                                                                                                              | evidence / pin                                                     |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `runCommand`: stdin piping, streaming, startupError→127, SIGTERM timeout→124/killed, SIGKILL escalation    | PRESERVE (the redesign's harness sessions should run through this channel)                                                                                                                           | `foundation/test/integration/exec/exec-run-command.test.ts:27-146` |
| `StdinCapableCommandExecApi` brand vs Pi's stdin-dropping exec                                             | PRESERVE — harness invocations that need stdin (both Reviews runners, Codex especially) must require the brand or an equivalent guarantee                                                            | `command.ts:49-68`                                                 |
| AbortSignal → spawn semantics                                                                              | UNDEFINED — untested at every layer                                                                                                                                                                  | `exec/index.ts:91-93`, `:155-159`                                  |
| Kernel `ctx.exec` dropping `startupError`; `NsCommandExecApi` dropping env/signal and refusing foreign cwd | UNDEFINED/latent — the redesign's "caller-supplied command execution channels" (objective.md:33) inherit these narrowings and must either widen `NsExecOptions` or route around it — decision-needed | `kernel/src/cli/context.ts:68-73`; `command-runner.ts:38-58`       |

---

## 7. Contract gaps worth recording in the Objective

1. **Cancellation is entirely unpinned.** No test on any consumer exercises AbortSignal; `review-execution-cancelled` and `review-execution-blocked` have no producers; an abort today would surface as `harness-invocation-failed` (via `startupError`) or `harness-execution-failed` (via `killed`), and nothing asserts which. The session contract's cancellation story starts from a blank slate, not a compatibility constraint (`failures.ts:30-31`; `exec/index.ts:155-162`).
2. **`PiTextGenerator` has no direct tests.** The direct-inference half of the unified contract is currently specified only by its source and by consumer-side fakes (§4.3).
3. **Fast draft's execution paths (both) are untested** — only model resolution is pinned. The steelthread can change subprocess mechanics freely; the compatibility contract is just the resolution helpers plus the error-message shapes callers display (§1.6).
4. **Auth preconditions are enforced nowhere.** Reviews Claude requires `ANTHROPIC_API_KEY` only implicitly (via `--bare` semantics); a missing key is a generic harness failure. The companion doc's "fail explicitly" rule would make this an LBYL preflight — decision-needed (§2.6).
5. **Harness runs have no timeout** (Reviews, both harnesses), unlike fast draft's 120 s; and Claude-side session residue under `--bare` is unobserved (§2.7).
6. **The `ns`-hosted exec channel narrows the contract silently** (env/signal dropped, `startupError` dropped, cwd locked). Any session implementation that must run under `NsExtensionApi.exec` inherits these losses today (§5.2).
