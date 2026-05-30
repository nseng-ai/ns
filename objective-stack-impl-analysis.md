# `/objective-stack-impl` — Deep Analysis

## 1. What this actually is

This is a **prompt-first, parent-LLM-driven orchestration workflow** for implementing one asdl Objective as a small Graphite stack. The defining architectural decision (stated explicitly in the on-disk design record `.asdl/objectives/objective-stack-impl/objective.md`) is:

> _The parent session is the orchestrator. It plans the stack, chooses the next slice, invokes child sessions as focused LLM-space function calls, interprets their returned text, validates the result, and decides whether to continue. The extension layer provides generic child-session infrastructure and light guardrails; **it should not become the domain brain**._

So the system is deliberately split into two layers with a hard line between them:

| Layer | Artifact | Owns |
| --- | --- | --- |
| **Judgment / domain brain** | `.pi/prompts/objective-stack-impl.md` (a _prompt_, not code) | Planning, slice selection, subagent prompt authoring, result interpretation, validation, Objective updates, commit/amend, continue-or-stop |
| **Deterministic plumbing** | `ts/packages/pi-extensions/src/*` (engineered, tested TS) | Objective picking UI, prompt-template injection, spawning subagent subprocesses, parsing their JSON event streams into typed statuses, telemetry |

The `.pi/` files originally pointed at are both **thin discovery shims**:

- `.pi/prompts/objective-stack-impl.md` — the actual 350-line orchestrator prompt.
- `.pi/extensions/objective.ts` — a 3-line re-export of `ts/packages/pi-extensions/src/objective.ts` (28 KB, the real implementation).

Pi auto-discovers files under `.pi/`; the real engineered code lives in the private `@asdl/pi-extensions` workspace package where it can have tests and fakes. This is documented as an intentional pattern in `CONTEXT.md` ("Discovery surface vs engineered package").

---

## 2. End-to-end control flow

### Phase A — Command entry (TypeScript, `objective.ts`)

`objectiveExtension(pi)` (line 915) registers five command families. The relevant one:

```
pi.registerCommand("objective-stack-impl", { handler: handleObjectiveStackImplCommand })
```

`handleObjectiveStackImplCommand` (line 575) branches:

- **Explicit slug given** (`/objective-stack-impl my-slug`) → skip the picker, go straight to `invokeObjectiveStackImplPrompt`.
- **No slug** → `chooseActiveObjectiveSlug` runs the interactive picker.

### Phase B — The Objective picker (TypeScript)

`chooseActiveObjectiveSlug` (line 500) is a surprisingly rich UX:

1. Shells `objective list --format json` → parsed by `objective-list.ts` through a "machine envelope" (`parseMachineEnvelopeData`).
2. Computes which Objectives have **changed**, from two independent git signals (`changedObjectiveSelection`, line 259):
   - **Committed** changes vs trunk: `git diff --name-status -M <trunk>...HEAD -- .asdl/objectives` (rename-aware, line 290).
   - **Dirty** working-tree changes: `git status --porcelain=v1 -z -- .asdl/objectives` (NUL-delimited, handles rename/copy pairs, `objective-picker.ts:31`).
3. Slugs are extracted from paths (`.asdl/objectives/<slug>/...`) and the picker **floats the changed Objective(s) to the top** with a "suggested: only Objective changed …" annotation (`formatObjectiveChoice`, line 89). If exactly one Objective changed, it offers it first with a "View other active Objectives…" escape hatch.

This means: invoke it mid-work and it guesses the Objective you're touching — but it _suggests_, it never auto-selects (the prompt forbids inference).

> **Graphite-boundary note:** the picker shells only `git` and `objective` — never `gt`. That respects the repo's "Runtime Graphite Dependency Boundary" rule (use `GitGateway` for ordinary repo facts). Graphite is left entirely to the parent agent's prompt-driven workflow.

### Phase C — Prompt injection (TypeScript → handoff to LLM)

`invokeObjectiveStackImplPrompt` (line 393):

1. `await ctx.waitForIdle()`.
2. Finds the template path via `findPromptTemplatePath` — first asking Pi for a registered `source: "prompt"` command named `objective-stack-impl`, falling back to `<cwd>/.pi/prompts/objective-stack-impl.md` (line 377).
3. Reads the markdown, then `buildObjectiveStackImplPrompt` (line 384) **strips the YAML frontmatter** and substitutes every `$ARGUMENTS` with the chosen slug.
4. `pi.sendUserMessage(...)` — injects the fully-rendered orchestrator prompt as if the user typed it.

**This is the entire job of the TS extension for this feature: pick a slug, render the prompt, inject it.** Everything after is the LLM following the prompt.

### Phase D — The orchestration loop (LLM, driven by the `.md`)

The prompt walks the parent agent through a strict sequence:

1. **Resolve the Objective** — normalize `.asdl/objectives/<slug>` → `<slug>`; if `closed.md` exists, **stop**.
2. **Compact current context** in prose (handoff-style, in-session only — _not_ a durable artifact).
3. **Inspect** Objective records + repo state (`git status`, branch, diffs). A **tracking gate**: if implementation progress looks unrecorded, stop and tell the user to run `objective-update`.
4. **Preview & confirm** — present a 1–3 PR plan with per-branch thesis/validation/independent-reviewability, expected Objective end-state, stop conditions. **Do not proceed without explicit "yes."**
5. **Per-slice loop**: create/navigate the Graphite branch → author a complete subagent prompt → call `dispatch_runner_subagent` → wait → record a slice-result entry → verify independently → `objective-update` if meaningful → commit/amend → decide continue-or-stop.
6. **Telemetry + final digest** (see §5).

### Phase E — `dispatch_runner_subagent` (TypeScript, the real engine)

Critically, **this tool is registered by a _different_ extension** — `.pi/extensions/dispatch-runner-subagent.ts` → `src/dispatch-runner-subagent.ts`, **not** by `objective.ts`. The prompt and the tool are decoupled; the workflow silently depends on _both_ extensions being loaded.

When the LLM calls it (`dispatch-runner-subagent.ts:105`):

- Validates non-empty `title` + `prompt`.
- Calls `dispatchRunnerSubagent` with `returnMode: "final-text"` and **no terminal tools**.
- Streams progress to a UI widget (turns, tools, elapsed, session file) via `onProgress`.
- Returns a formatted text block + structured `details` carrying the typed status.

---

## 3. The subagent engine (`runner-subagent/subagent-process.ts`)

This is the heart of the plumbing — a hardened subprocess manager (`dispatchRunnerSubagentProcess`, line 87).

**Spawn model.** It re-invokes Pi itself as a child subprocess. `resolvePiInvocation` (line 313) bootstraps the right command: reuse the current Pi script via `process.execPath` when discoverable, else fall back to the `pi` binary. `buildChildPiArgs` (line 255) constructs:

```
pi --mode json -p --no-extensions [--extension <generated>] --session <file> <prompt>
```

**Key consequence for this workflow:** because dispatch passes `returnMode: "final-text"` with zero terminal tools, the `runtimeFiles` branch (line 110) is skipped, so **no `--extension` is injected**. Each slice subagent runs a **completely vanilla Pi** — `--no-extensions`, no project commands, no `dispatch_runner_subagent` of its own (no recursion), in the _same cwd_. It's a plain coding agent that can still shell `git`/`gt`/`objective`/`just` via Bash.

**Two return modes (only one used here).** The engine is general-purpose and supports:

- **Terminal capture** — generates a temporary runtime extension (`subagent-runtime-extension.ts`) that registers capture-only "terminal" tools (`completed`/`blocked`); the child calls one, it writes a result file and aborts, and that structured input becomes the parent's result. The runtime extension even installs a `tool_call` hook that blocks all further non-terminal tools after capture (line 153).
- **Final-text** — the parent just accepts the child's final assistant text, extracted from Pi JSON events (`json-events.ts` parses `message_end`/`turn_end`/`agent_end` shapes).

This workflow uses **only final-text**. The prompt explicitly says terminal-capture statuses "are not expected … Do not treat them as completion without inspection." The terminal-capture machinery is retained as general infra (and is heavily tested) but is dead weight for `/objective-stack-impl` specifically.

**Status state machine.** `resolveClosedRunnerSubagentResult` (line 346) maps subprocess outcomes to a discriminated union (`runner-subagent.ts:118`): `final-text`, `completed`, `blocked`, `stopped-without-terminal`, `stopped-without-useful-text`, `cancelled`, `error`, `protocol-error`. The prompt's interpretation rules (lines 207-217) mirror this exactly: only `final-text` is a success _candidate_ (still verify independently); everything else demands session-file inspection.

**Hardening details worth calling out:**

- **Abort propagation**: parent + option signals merged (`uniqueAbortSignals`); on abort → `SIGTERM`, then `SIGKILL` after a 5 s `killTimeoutMs` escalation (line 189).
- **Bounded stderr**: `BoundedTextBuffer` (line 673) keeps only the last 8 KB, byte-accurate, with an "N bytes omitted" prefix.
- **Final-text truncation**: capped at 48 KB for the model (`MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS`), with a pointer to the full session file (`dispatch-runner-subagent.ts:158`).
- **Session files**: every run writes a JSONL session file (default under `tmpdir()/pi-runner-subagents`, mode `0o700`) — this is the _durable, inspectable_ artifact the prompt's "manual recovery" model relies on.
- **Best-effort UI/cleanup**: widget updates and runtime-file cleanup are wrapped so they can never alter the result.

---

## 4. Module map

| Module | Role |
| --- | --- |
| `objective.ts` | Registers `/objective-stack-impl`, `/objective-list`, `/objective-gt-stacks`, `/objective-next\|current\|update`; picker + prompt injection |
| `objective-list.ts` | Parse `objective list --format json` machine envelope |
| `objective-picker.ts` | Changed-Objective detection (diff + porcelain status, rename-aware), choice formatting, "changed-first" ordering |
| `skill-expansion.ts` | Inlines skill bodies (used by `objective-next/current/update`, _not_ stack-impl which uses a prompt template) |
| `command-runtime.ts` | `exec` result shaping, `formatCommand`, tail/truncate helpers |
| `dispatch-runner-subagent.ts` | The `dispatch_runner_subagent` **tool** definition + result/detail formatting |
| `runner-subagent.ts` | Type union for results/statuses; `dispatchRunnerSubagent` entry |
| `runner-subagent/subagent-process.ts` | Subprocess spawn, lifecycle, abort/kill, status resolution |
| `runner-subagent/subagent-runtime-extension.ts` | Generated terminal-capture runtime (unused by this workflow) |
| `runner-subagent/json-events.ts` | Parse Pi JSON event stream → progress + final text |
| `asdl-objectives/exec/runner_subagent_usage.py` | `objective exec runner-subagent-usage` telemetry (Python) |
| `asdl-objectives/gt/stacks.py` | `objective gt stacks` — Graphite-stack Objective view (Python) |

---

## 5. Telemetry (`objective exec runner-subagent-usage`)

The prompt's final step aggregates every non-empty subagent `sessionFile` and runs this Python command (`runner_subagent_usage.py`). It parses the JSONL session files, sums per-assistant-response `usage` (input/output/cache tokens + USD cost), tracks peak observed tokens and model refs, and renders a Markdown table + aggregate. It is robust to bad inputs with explicit per-file statuses (`missing`, `not_file`, `invalid_json`, `read_error`, `no_usage`).

Notably, `configured_context_window_tokens` is **hardcoded to `None`** ("unavailable in runner subagent logs") — matching the prompt's instruction _not_ to claim a context-window capacity. The prompt also forbids using telemetry to infer completion or correctness — it's **factual accounting only**.

---

## 6. Design principles embodied

1. **LLM owns judgment; code owns determinism.** The TS never parses freeform child prose to decide completion; the parent LLM interprets. The only deterministic parsing is of _structured_ JSON events and machine envelopes.
2. **No hidden state.** v1 is explicitly Branch-Memory-free: no stack schemas, slice ledgers, or handoff artifacts. Recovery = inspect git/Graphite state, Objective files, session-file JSONL, and the transcript.
3. **Safety as parent guardrails, not enforced invariants.** "One subagent at a time, same worktree," "no auto-PR," "check worktree before launch" are _prompt instructions_. The TS does not enforce sequencing or worktree cleanliness.
4. **Composability / generic infra.** `dispatch_runner_subagent` is domain-agnostic (`title` + `prompt` only). The Objective-specific logic lives entirely in the prompt. The same engine backs terminal-capture callers elsewhere.
5. **Boundary discipline.** The TS honors the Graphite-dependency boundary (shells `git`, not `gt`) and the empty-`__init__`/canonical-import conventions on the Python side.

---

## 7. Findings worth flagging

**a) Terminology drift between the design record and the live code.** The closed Objective (`objective.md`, its `updates/`, and the closure "Key evidence") describe the implementation in terms of `runChildSession`, the `run_child_session_text` tool, and `ts/.../src/run-child-session.ts` + `.pi/extensions/run-child-session-text.ts`. **None of those names exist in the code anymore** — they were renamed post-closure to `dispatchRunnerSubagent` / `dispatch_runner_subagent` / `runner-subagent.ts` / `dispatch-runner-subagent.ts`. The Objective's documented evidence paths are now stale and won't resolve. Functionally identical, but a future maintainer cross-referencing the design record will hit dead paths.

**b) The Objective is closed — so the workflow self-aborts on itself.** `.asdl/objectives/objective-stack-impl/closed.md` exists, so `/objective-stack-impl objective-stack-impl` would stop at prompt step 4 ("the selected Objective is closed"). Expected, just noting the meta-loop.

**c) Implicit two-extension coupling.** The prompt names `dispatch_runner_subagent`, but that tool is registered by a _separate_ discovery shim (`dispatch-runner-subagent.ts`), not by `objective.ts`. If that shim is ever removed/renamed, `/objective-stack-impl` breaks at the dispatch step with no static link to warn you.

**d) No wall-clock timeout on the subagent.** The picker's `exec` calls all carry 30 s timeouts, but `dispatch_runner_subagent` passes only an `AbortSignal` — no time limit. A hung or runaway slice subagent runs until the user/parent aborts. Defensible (slices can be long), but it's an asymmetry, and the kill path only triggers on abort, not on elapsed time.

**e) Final-text extraction is Pi-event-shape-dependent.** Acknowledged in the Objective's own risk list — `json-events.ts` de-risks known shapes (`message_end`/`turn_end`/`agent_end`) with fake-driven tests, but future Pi event-format changes are a compatibility risk for the whole return path.

**f) The dead terminal-capture path.** For _this_ workflow it's pure overhead — the prompt says those statuses "are not expected." It exists because the engine is shared infra. Worth knowing when reading the engine that a large fraction of `subagent-process.ts` (runtime-file generation, terminal validation, capture results) is never exercised by `/objective-stack-impl`.

---

## 8. Bottom line

This is a clean realization of "the LLM is the orchestrator, the code is the plumbing." The `.md` is the program; the TypeScript is a small, well-tested, hardened set of primitives (pick an Objective, render a prompt, spawn/observe a vanilla Pi subprocess, account for tokens). The deliberate refusals — no Branch Memory, no durable stack schema, no deterministic prose parsing, no auto-PR, safety as parent guardrails — are all consistent and intentional per the design record. The main maintenance hazards are documentation drift (the closed Objective references the pre-rename `child-session` names) and the implicit prompt↔tool coupling across two separate extension files.
