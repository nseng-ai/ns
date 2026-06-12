# Cross-Harness Workflow Parity

## Thesis

This toolkit has been built Pi-native: Pi's JS extension system registers slash commands that run logic directly, with no language-model round trip. Claude Code and Codex have no such extension layer — they reach workflows only through **skills** (markdown `SKILL.md`) that call **CLIs**. The goal is that the Pi extension layer is purely _additive_: deterministic logic lives in a shared CLI usable by every harness, a skill documents the workflow for Claude/Codex, and the Pi extension is a thin ergonomic layer (picker, custom UI, structured tool) on top. What we do not want is workflow logic trapped in TypeScript with no CLI/skill path (a gap), or the same logic re-implemented in two places (duplication).

An audit (2026-06-03) confirmed the architecture already makes this cheap: the CLI→Pi bridge (`ts/packages/pi-extensions/src/cli-command-extension.ts`) is generic — any CLI command table becomes Pi slash commands with zero per-command code — and skills are a single on-disk artifact (`skills/<name>/SKILL.md`) consumed identically by Pi (`/skill:<name>`), Claude (`.claude/skills`), and Codex (`.agents/skills`). The gap pattern has since shifted: the original audit found **primitives shared, orchestration trapped in pi-extensions**, but the orchestration has now consolidated into `@asdl/ccc` — shared, test-backed TypeScript (the land-stack core runs on Graphite SQLite metadata with fake-driven guard tests; autobranch and the cmux dispatch modules are similarly factored). What remains trapped is not the logic but the **entry point**: `@asdl/ccc` ships no bin and no skill, so its workflows are reachable only when Pi loads the package. The remaining push-down work is therefore precisely "give each tested ccc core a CLI entry point plus a skill," building on the `ts-cli-foundation` layer — the `@asdl/clinkr` schema-first command shell and `@asdl/core` exec/gateway runtime — rather than growing bespoke scaffolds.

This Objective is the cross-harness parity **umbrella**. It owns a living parity table (every Pi surface → its parity status), every remaining parity gap, and a durable parity-review workflow that prevents new gaps from landing. The sibling Objectives it previously deferred rows to — `planned-branch-ts-cli` and `asdl-dev-submit-consolidation` — are both closed; their delivered rows are folded into the table here and the umbrella now owns all remaining gaps directly.

The former standalone `command-output-summaries` Objective is subsumed here as a parity-native shared primitive workstream. It is not a Pi-surface row yet because no Pi command/tool exists; the work is tracked here so the first summarized-command implementation is a shared CLI/helper with skill guidance before any optional Pi adapter appears.

## Scope

- Maintain a living **parity table** (`parity-table.md` in this Objective directory) classifying every Pi extension command and custom tool as FULL / PARTIAL / NONE / WAIVED parity, with the shared CLI backing and the driving skill per row. The table was seeded from the 2026-06-03 audit and last fully swept 2026-06-10. Keeping it current is part of this Objective's tracking discipline (see below).
- Close the **orphan orchestration** gaps by giving the existing tested `@asdl/ccc` cores clinkr-based CLI entry points (on `ts-cli-foundation`) and thin skills, with Pi importing the same core (routing any model-text steps through the backend-neutral text-generation/model-defaults seam):
  - stack landing — the unified `/code:land` stack path; the orchestration core (`ccc/src/land.ts` + `land-stack/`) is already extracted and test-backed; the remaining work is the CLI entry + skill.
  - cmux dispatch (`/ccc:workspace:dispatch-plan`, `/ccc:workspace:dispatch-prompt`, and the thin `/ccc:workspace:open-branch` pairing) — a CLI taking explicit inputs (plan path, prompt) over the ccc cmux modules and the shared `launchFocusedCmuxTab`/prompt-file utilities, with an agent-neutral launch path; Pi keeps only session-history "latest plan" resolution.
  - `autobranch` — a CLI entry over `ccc/src/autobranch/` (stash → create → restore → checkpoint commit, branch-name selection; slug derivation already shared via `@asdl/plans`).
- Provide **skill-only** parity where there is nothing worth extracting: the single-PR path of the unified `/code:land` (document the `gh pr merge` contract, base-branch guard, and `--match-head-commit` pinning) and `/code:changes` (lightweight summary, or a recorded waiver if judged purely cosmetic).
- Reconcile `/cp-preview` with `asdl-dev cp` (CLI preview mode or a recorded waiver).
- Sustain the **parity-review discipline**: the `parity-review` route of the `code-workflows` skill (renamed 2026-06-11 from `internal-code-workflows`) runs diff-scoped review (flagging any added/changed Pi command or tool lacking a CLI+skill counterpart or a recorded waiver) and on-demand full-repo sweeps that refresh the parity table. The waiver rule for genuinely Pi-native primitives (e.g. `dispatch_runner_subagent`, `grill_ask` TUI, the worktree status line): acceptable Pi-only provided dependent workflows document an agent-neutral fallback.
- Own the former `command-output-summaries` workstream as a parity-native shared primitive: define and implement a harness-neutral summarized-command CLI/helper that writes full stdout, stderr, and combined logs to payload artifacts, returns bounded deterministic summaries, exposes explicit command/cwd/timeout semantics, supports generic/test/lint/typecheck profiles, and provides skill guidance plus optional Pi adapter without making Pi canonical.

Delivered scope, kept as context rather than live work: the `asdl-dev` discoverability skills (`dev-preview-url`, `code-submit`, the `code-checkpoint` delegation to `asdl-dev cp`; the `internal-code-*` skill family was renamed to `code-*` on 2026-06-11), the `/handoff:list` deduplication onto the `handoff list` CLI, and the provider-model-default consolidation behind `@asdl/plans` `model-defaults.ts`.

**Parity table tracking:** `parity-table.md` is the canonical status surface for this Objective. Rules:

- Every Pi extension command and custom tool appears as exactly one row.
- A row is **FULL** only when a shared CLI carries the deterministic logic and a skill drives it so Claude/Codex reach the workflow standalone; the Pi part must be purely additive.
- **WAIVED** rows are genuinely Pi-native primitives whose value _is_ the Pi UI/session behavior; they require a documented non-Pi fallback for any dependent workflow.
- The table is refreshed whenever this Objective is updated with parity-relevant findings, and the parity-review workflow's full-sweep mode (the `parity-review` route of the `code-workflows` skill) checks it against live evidence and refreshes it with a Semantic Update when drift is found.
- Shared primitives with no Pi surface yet do not get parity-table rows until a Pi command/tool exists; this Objective may still track them in roadmap prose when their purpose is to prevent a future parity gap.

## Non-Goals

- Do not aim for identical _UI_ across harnesses. Parity means workflow reachability, not pixel/widget equivalence. Pi-native UI (pickers, `grill_ask`, status line) stays Pi-only.
- Do not build the machine-checkable CI parity gate / parity manifest in this Objective; it is parked as a later hardening of the review workflow.
- Do not turn `asdl-dev` into a nested command framework or build a generalized "branch artifacts" CLI above `brmem`.
- Do not add routine validation-only roadmap rows; targeted checks/tests are completion evidence.
- Do not make summarized-command execution a broad bash interceptor, Pi-only runner-subagent feature, or LM-driven summarizer. The default command summary remains deterministic, harness-neutral, and explicit opt-in behavior.

(Historical: this Objective previously declined to re-own the planned-branch and submit workstreams while `planned-branch-ts-cli` and `asdl-dev-submit-consolidation` were open; both siblings are now closed and their delivered rows are folded into the parity table here.)

## Completion Criteria

- Every row in `parity-table.md` is either **FULL** (shared CLI + skill, Pi additive) or a recorded, justified **WAIVED** primitive with a documented agent-neutral fallback — except any consciously parked rows. No unexplained PARTIAL/NONE rows remain.
- Stack landing, the cmux dispatch family, and `autobranch` are reachable by Claude/Codex via CLI + skill, with the Pi extensions importing the same `@asdl/ccc` cores and no duplicated orchestration. Model-text steps (slug, summary) run through the backend-neutral text-generation/model-defaults seam, not the Pi-only model harness.
- `/cp-preview` and `/code:changes` are resolved: each reaches FULL or a recorded WAIVED verdict.
- The command-output summary primitive exists as a shared CLI/helper with skill guidance and optional Pi integration only as an adapter: it writes complete stdout/stderr/combined logs to payload artifact files, returns bounded human and machine-readable summaries with profile-derived counts/excerpts where practical, treats nonzero exits/timeouts as summarized outcomes, and proves no-leak behavior with synthetic large-output tests.
- A parity-review full-sweep run (the `parity-review` route of `code-workflows`) reports no unwaived gaps, captured as closure evidence.
- Evidence: targeted `just ts-check` / `just ts-test` and Python checks pass for changed areas; CLI scenario tests cover each new CLI's operations, help, and version.

## Assumptions and Risks

Assumptions:

- The generic CLI→Pi bridge and shared on-disk skills make parity a fill-the-gaps effort, not a rewrite (validated by the 2026-06-03 audit and by every closed row since: each gap was independently closable by adding a CLI entry + skill with Pi shrinking to a thin wrapper).
- Model-text neutrality is solved infrastructure: slug derivation is one canonical `@asdl/plans` helper resolving `ASDL_SLUG_MODEL` over the shared `DEFAULT_FAST_MODEL_REF`, and the remaining model-touching defaults are env-overridable (`PI_DRAFT_MODEL`, `ASDL_CCC_SIDEBAR_MODEL`, `ASDL_DEV_CHECKPOINT_MODEL`). Validated by the provider-default consolidation; new code must keep using the seam.
- The `@asdl/ccc` cores are extraction-ready: the land-stack orchestration (Graphite SQLite-metadata topology, fork-violation detection, backup refs, pre-delete child guards) and autobranch transaction are already factored into focused modules with test coverage, so the push-down rows are CLI-entry + skill work, not logic extraction.
- New shared CLIs created by this Objective's push-down rows, when implemented in TypeScript, build on the `ts-cli-foundation` layer — the `@asdl/clinkr` command shell and `@asdl/core` exec/gateway modules — rather than growing bespoke scaffolds.
- Genuinely Pi-native primitives (`dispatch_runner_subagent`, `grill_ask` TUI, worktree status line) are acceptable to keep Pi-only provided dependent workflows document an agent-neutral fallback.
- The summarized-command work belongs in this umbrella because its core architectural decision is parity: command execution and log summarization must be reachable from every harness through the same CLI/helper instead of appearing first as a Pi-only convenience.

Risks:

- Parity-table rot: the table is worthless if updating it is not enforced. This risk has now materialized **four** times: stale `/objective:gt-stacks` rows, the stale `/handoff:list` PARTIAL row, the pre-2026-06-09 backlog (`/cmux:*` → `/ccc:*` rename, the `/code:land` unification, several unlisted surfaces), and the pre-2026-06-10 backlog (the `/model:*` family, `/ccc:claude-plan-tab`, `/code:pr-regen`, and the `/planned-branch:upstack-impl-session` rename all accumulated unlisted). The full-sweep workflow works as a corrective control, but refreshes still lag surface changes; diff-scoped review at change time remains the weak point.
- "Shared TS ≠ shared CLI": consolidating orchestration into `@asdl/ccc` looks like parity progress but is invisible to Claude/Codex until a bin and skill exist — the package currently ships neither. A future consolidation could likewise masquerade as a closed gap; the parity table must keep scoring reachability (CLI + skill), not code placement.
- Provider lock-in drift: largely de-risked by the provider-default consolidation (every named hardcoded site now resolves through the `@asdl/plans` model-defaults seam or a per-purpose env override, and shared prompt/skill guidance carries harness-neutral defaults with labeled OpenAI/Anthropic examples per the AGENTS.md "Skill Model Examples" convention). Residual exposure is new code reintroducing hardcoded refs; the parity-review sweep's harness/model check remains the control.
- Umbrella sprawl: a cross-cutting Objective touching many subsystems can become a never-closing catch-all, and folding in the closed siblings' rows plus command-output summaries increases that risk. Mitigation: the sibling rows arrived already-FULL (tracking only), and summarized commands stay one bounded shared-primitive workstream with explicit completion criteria rather than a generic validation-output program.

## Open Questions

- What should the ccc CLI surface be: one `ccc` bin exposing land/dispatch/autobranch subcommands, commands grafted onto `asdl-dev`, or per-workflow bins? Coordinate with `ts-cli-foundation`, whose clinkr/core layer is the expected substrate either way.
- Does `/code:changes` deserve any parity, or should it be declared an accepted Pi-only cosmetic affordance (WAIVED) rather than getting a skill?
- For the summarized-command primitive, what final command name/package should own the shared helper, how directly should it reuse the shipped `asdl-core` payload artifact store, which concrete output formats should the first profiles parse, should Pi integration be a custom tool or command wrapper, and what hard caps should apply to transcript-visible tails/excerpts?
