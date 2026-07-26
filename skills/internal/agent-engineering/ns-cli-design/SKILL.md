---
name: ns-cli-design
disable-model-invocation: true
description: "Authoring discipline for ns CLIs, grounded in Clinkr. Invoke when designing, authoring, or reviewing an ns CLI command, command group, `exec` subgroup, machine output shape, exit/error behavior, raw-exit exemption, or destructive/confirmation flow."
references:
  - references/clinkr-api-map
  - references/checklist
  - references/human-tier
  - references/agent-exec-tier
  - references/danger-tiers
metadata:
  internal: true
---

# ns-cli-design

Canonical authority for **authoring** well-designed CLIs in ns. Every
Clinkr command serves two audiences at once: a human reading an evolvable UI and
an agent reading a stable machine contract back into its context window. A
command is done only when both audiences get a stable, bounded, recoverable
contract.

This skill shapes a command's **design surface** only: it is authoring
discipline, not a consumption guide and not a TypeScript style guide. For code
idioms, load `typescript-style`, then `ns-typescript` for the repo toolchain.
Out of scope: structural/DRY cleanup of CLI code and shell completion.

Decision provenance: `docs/research/agent-era-cli-design-survey.md` and ADRs
`docs/adr/0010`–`0015` (the Clinkr gap audit lives in the closed
`agent-cli-design-discipline` objective record, historical only). Exact
`@nseng-ai/clinkr` surfaces and ADR rationale
live in `references/clinkr-api-map.md`. A command is **done only when every item
in `references/checklist.md` passes**.

## How to use this skill

1. Read this `SKILL.md` for the hard gates, naming, and surface rules.
2. Load `references/clinkr-api-map.md` when you need exact constructors, types,
   API paths, or ADR rationale.
3. Load the tier reference only when needed:
   - `references/human-tier.md` — clig.dev-style human UX.
   - `references/agent-exec-tier.md` — schema-first machine contracts and `exec`.
   - `references/danger-tiers.md` — danger tiers and confirm/force verbs.
4. Apply `references/checklist.md` before shipping.

## Hard gates (non-negotiable)

These apply to every ns CLI command regardless of audience.

1. **Use the framework parser.** Build commands as `ClinkrGroup` /
   schema → handler → `ClinkrExit<T>`; do not hand-roll argv parsing or
   `process.exit`.
2. **`-h`/`--help`, `--version`, `--runtime` exist and work** for every CLI
   entrypoint, and are covered by scenario tests when part of the contract.
3. **stdout is the result; stderr is for humans/logs/status.** Machine output
   (`--format json`) goes to stdout; human negative/status messaging goes to
   stderr.
4. **Stable, documented machine output.** Agent-facing results carry a
   `resultSchema`; `--json-schema` must publish the real envelope shape. Human
   rendering (`renderHuman`) may evolve freely; the machine envelope may not,
   except additively.
5. **Process exit codes are coarse and stable:** `ok=0`, `negative=1`,
   `failure`/`usageError=2` (ADR 0010, ADR 0013). Detailed failure semantics live
   in the machine envelope (`errorType` + structured `data`), not in numeric exit
   codes.
6. **Non-interactive by default.** Prompts are allowed only when stdin is a TTY
   (`ClinkrInteraction.isInteractive()`); non-interactive invocation must fail
   fast with a `usageError` that names the missing flag, never hang on a prompt.
7. **Skill/agent-only operations live under a hidden `exec` subgroup**
   (ADR-aligned with AGENTS.md "Skill-Invoked CLI Commands"). Construct the
   subgroup `ClinkrGroup` with `isHidden: true`; do not mutate it after
   construction.
8. **Raw exit is exceptional** (ADR 0015). See "Raw-exit is a narrow exemption"
   below for the sanctioned cases.

## Streams and help — the two audiences, separated at the byte level

- Provide concise default help plus complete `-h`/`--help`; help, examples, and
  `--json-schema` must agree with each other and with any agent-facing prose.
- Human-facing non-`exec` command options should expose short aliases by default.
  Choose aliases from local convention where possible: `-y` for `--yes`, `-f`
  for `--force`, `-n` for dry-run/preview when it does not conflict, `-v` for
  verbose, and clear local letters such as `-s` for slug/status/shell. Exceptions
  must be explicit: framework/meta flags, local conflicts, ambiguous shorthand,
  rare low-value flags, or aliases that reduce clarity. Hidden `exec` options are
  exempt unless there is a strong human-facing reason.

## The result envelope (ADR 0010, 0011, 0013)

Design *to* the typed machine envelope.

- Return an exit constructor: `ok(data)`, `negative(message, { data?, human? }?)`,
  `failure(errorType, message, data?)`, or `usageError(message, data?)`.
- The envelope is a camelCase discriminated union keyed on `status`, carrying
  `exitCode` plus `errorType`/`message`/`data` where the variant has them. No
  parallel snake_case or Python-parity shape (ADR 0011).
- Publish the real envelope with `--json-schema`; this is how agents learn the
  stable contract from a type.
- `negative(...)` is shell-visible non-success (exit 1). A harmless empty/no-op
  result returns `ok(...)` with empty data instead; there is no
  `--shell-exit-code` opt-in (ADR 0013).
- `failure`/`negative` carry structured `data` for recovery under a stable,
  command-local `errorType`. Do not mint a global `errorType` enum (ADR 0010).
- Property names are camelCase; serialized enum-like **values** are **kebab-case**
  for ns-owned machine contracts — `errorType` values and any command-local
  `code`/`type`/`status`/`kind` discriminants (e.g. `registry-check-failed`,
  `dry-run`, `branch-context-error`). No snake_case, no aliases (ADR 0010). Model
  known external strings (GitHub/Anthropic/Pi/git wire values) as TypeScript
  literal unions and keep their exact spelling. The
  `NS_TS_BAN_SNAKE_CASE_CLI_MACHINE_VALUE` style guard enforces this for
  `failure(...)` error types and `errorType` literals.
- Prefer a handler-returned `usageError(...)` whose `data` names the bad/missing
  argument over throwing.

## Output volume is command-local (ADR 0012)

Clinkr ships **no** pagination/truncation/compaction/JSONL framework API. A
result that can grow large picks its own domain-appropriate bounds — filters,
limits, ranges, summaries — and exposes completion state, the applied bound, and
continuation/narrowing guidance in the result schema.

Do not promise `--compact`, pagination, JSONL, or a generic bounded-result
wrapper the framework does not have. Reopen framework extraction only on the ADR
0012 evidence threshold.

## Danger tiers (ADR 0014)

Four authoring tiers are review discipline, **not** a Clinkr framework type.
`ClinkrInteraction.confirm` + injected `isInteractive()` are the primitives.

- **Tier 0 — read-only / inspect.** No mutation, no confirmation.
- **Tier 1 — scoped, reversible mutation.** No confirmation; state what changed.
- **Tier 2 — destructive / external mutation.** Authorize non-interactively with
  **`--yes` / `-y`**. TTY humans may be prompted; non-interactive callers must
  not.
- **Tier 3 — high blast radius / irreversible / computed target set.** Authorize
  with **`--force` / `-f`** and offer a dry-run/preview where possible.

Cross-cutting rules:

- **`--yes` ≠ `--force`.** `--yes` confirms a scoped destructive write;
  `--force` overrides a precondition/guard.
- Non-interactive missing authorization returns `usageError(...)` (exit 2) whose
  `data` names the missing flag. Every prompt gates behind `isInteractive()`.
- Refusal because the computed impact is unsafe returns `negative(...)` (exit 1)
  carrying impact data.
- `--dry-run` is a successful inspection: return `ok(...)` with the computed
  plan/impact, never `negative(...)`.

Mirror existing conformance: `ns handoff delete` is Tier 2 (`--yes`;
its missing `-y` is a cutover exception, not a pattern for new commands);
`ns handoff gc`, `slot gc`, `brmem put` are Tier 3 (`--force`; apply `-f`
for new human-facing Tier 3 commands unless a steered exception says otherwise).

## Naming and exec placement

- Prefer fewer, higher-level commands that match real workflows over a thin
  wrapper per low-level operation.
- Top-level commands are the verbs a person would type; keep top-level `--help`
  focused on them.
- Namespace commands so boundaries are legible (`pkg verb`, `pkg exec verb`).
- The `exec` namespace already implies the agent actor (placement mechanics in
  hard gate 7), so name `exec` operations as plain noun/verb phrases
  (`resolve-prompt`, `get-reviews`). Hidden affects help rendering only, not
  invocability.
- Treat command names, flags, subcommands, output formats, and config as
  long-lived interfaces; change them additively.

## Raw-exit is a narrow exemption (ADR 0015)

`rawCommand` / `isRawExit` opts out of the envelope, `resultSchema`, and
`--json-schema`. It is sanctioned **only** when the command's core contract is a
TUI, a streaming protocol, or process-control / third-party command passthrough.
Ordinary agent-facing, finite-result commands must use the Clinkr envelope; do
not reach for `rawCommand` as a shortcut. Even a genuinely raw command must map
real backend failures to exit `2`; exit `1` remains semantic non-success.

## Design around the framework, don't pretend

Several rules above want capabilities Clinkr deliberately does not ship:
output-volume APIs, danger-tier metadata, a global `errorType` enum, command
aliases, typed confirmation phrases, and a declarative dry-run convention. When a
rule needs one of these, implement it command-locally and say so; never write
code or docs implying the framework API already exists.

## Before you ship

Run `references/checklist.md` against the command. When the change alters a CLI
design contract that an open Objective tracks, reflect it back with
`objective-update` under that Objective.
