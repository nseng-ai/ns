# Cross-Harness Workflow Parity

## Thesis

This toolkit has been built Pi-native: Pi's JS extension system registers slash commands that run logic directly, with no language-model round trip. Claude Code and Codex have no such extension layer — they reach workflows only through **skills** (markdown `SKILL.md`) that call **CLIs**. The goal is that the Pi extension layer is purely _additive_: deterministic logic lives in a shared CLI usable by every harness, a skill documents the workflow for Claude/Codex, and the Pi extension is a thin ergonomic layer (picker, custom UI, structured tool) on top. What we do not want is workflow logic trapped in TypeScript with no CLI/skill path (a gap), or the same logic re-implemented in two places (duplication).

An audit (2026-06-03) confirmed the architecture already makes this cheap: the CLI→Pi bridge (`ts/packages/pi-extensions/src/cli-command-extension.ts`) is generic — any CLI command table becomes Pi slash commands with zero per-command code — and skills are a single on-disk artifact (`skills/<name>/SKILL.md`) consumed identically by Pi (`/skill:<name>`), Claude (`.claude/skills`), and Codex (`.agents/skills`). So this is a "fill specific gaps" effort, not a rewrite. The gaps cluster around one pattern: **primitives are shared, orchestration is trapped** — the individual mutations (`gh`, `gt`, `slot`, `brmem put`, `asdl exec cmux-workspace-summary`) are CLIs, but the multi-step sequences, preflight guards, and name/slug derivation live only in Pi TypeScript, often reading Pi session state.

This Objective is the cross-harness parity **umbrella**. It owns a living parity table (every Pi surface → its parity status), the orphan gaps not already owned by a sibling Objective, and a durable parity-review skill that prevents new gaps from landing. It does **not** re-own the planned-branch or submit workstreams — those are tracked by `planned-branch-ts-cli` and `asdl-dev-submit-consolidation` respectively; the parity table links to them.

## Scope

- Maintain a living **parity table** (`parity-table.md` in this Objective directory) classifying every Pi extension command and custom tool as FULL / PARTIAL / NONE / WAIVED parity, with the shared CLI backing, the driving skill, and the owning Objective per row. The table is seeded from the 2026-06-03 audit. Keeping it current is part of this Objective's tracking discipline (see below).
- Close the **discoverability** gaps: author thin skills that surface the already-runnable `asdl-dev` commands (`preview-url`, `cp`, `submit`) to Claude/Codex, and reconcile the duplication between the `internal-code-checkpoint` skill and `asdl-dev cp`.
- Close the **orphan orchestration** gaps by pushing the trapped logic down into shared CLIs (routing any model-text steps through the backend-neutral text-generation abstraction `asdl-dev` already uses) and adding thin skills, with Pi importing/mirroring the extracted core:
  - `land-stack` (Graphite stack landing) — highest risk, must be test-backed.
  - cmux dispatch (`/cmux-slot:dispatch-plan`, `/cmux-dispatch`, and the thin `/cmux-slot:open-branch` pairing) — extract orchestration that takes explicit inputs instead of reading Pi session state.
  - `autobranch` — `asdl-dev autobranch` for the stash→create→restore→commit transaction and branch-name selection.
- Provide **skill-only** parity where there is nothing worth extracting: `/code:land` (document the `gh pr merge` contract, base-branch guard, and `--match-head-commit` pinning) and `/code:changes` (lightweight summary, or a recorded waiver if judged purely cosmetic).
- Eliminate the `/handoff:list` duplication: point the Pi command at the dedicated `handoff list` CLI instead of re-deriving listing over raw `brmem list` in TypeScript, keeping only the card renderer Pi-side.
- Author a durable **parity-review skill**: a diff-scoped review that flags any added/changed Pi command or tool lacking a CLI+skill counterpart (or a recorded waiver), plus an on-demand full-repo sweep that refreshes the parity table. Establish the waiver rule for genuinely Pi-native primitives (e.g. `dispatch_runner_subagent`, `grill_ask` TUI, the worktree status line): acceptable Pi-only provided dependent workflows document an agent-neutral fallback.

## Parity Table (living tracker)

`parity-table.md` is the canonical status surface for this Objective. Rules:

- Every Pi extension command and custom tool appears as exactly one row.
- A row is **FULL** only when a shared CLI carries the deterministic logic and a skill drives it so Claude/Codex reach the workflow standalone; the Pi part must be purely additive.
- **WAIVED** rows are genuinely Pi-native primitives whose value _is_ the Pi UI/session behavior; they require a documented non-Pi fallback for any dependent workflow.
- Rows owned by `planned-branch-ts-cli` or `asdl-dev-submit-consolidation` link to those Objectives and are not closed here.
- The table is refreshed whenever this Objective is updated with parity-relevant findings, and the parity-review skill's full-sweep mode regenerates it.

## Non-Goals

- Do not re-own or duplicate the **planned-branch** workstream (`/write-plan`, `/create-planned-branch`, `/impl-planned-branch`, `write_source_branch_plan_file`). It is fully scoped by `planned-branch-ts-cli`; this Objective only tracks its row.
- Do not re-own the **submit** consolidation; `asdl-dev-submit-consolidation` owns `/code:submit`. This Objective adds only the missing skill pointer if that sibling does not.
- Do not aim for identical _UI_ across harnesses. Parity means workflow reachability, not pixel/widget equivalence. Pi-native UI (pickers, `grill_ask`, status line) stays Pi-only.
- Do not build the machine-checkable CI parity gate / parity manifest in this Objective; it is parked as a later hardening of the review skill.
- Do not turn `asdl-dev` into a nested command framework or build a generalized "branch artifacts" CLI above `brmem`.
- Do not add routine validation-only roadmap rows; targeted checks/tests are completion evidence.

## Completion Criteria

- Every row in `parity-table.md` is either **FULL** (shared CLI + skill, Pi additive) or a recorded, justified **WAIVED** primitive with a documented agent-neutral fallback — except rows explicitly owned by `planned-branch-ts-cli` / `asdl-dev-submit-consolidation` (tracked, not closed here) and any consciously parked rows. No unexplained PARTIAL/NONE rows remain.
- `land-stack`, the cmux dispatch family, and `autobranch` are backed by shared CLIs and driven by skills so Claude/Codex can run them; the Pi extensions import/mirror those cores with no duplicated orchestration. Model-text steps (slug, summary) run through the backend-neutral text-generation abstraction, not the Pi-only model harness.
- `/code:land` and `/code:changes` have skills (or `/code:changes` is a recorded waiver), the `asdl-dev` commands are discoverable via skills, the `internal-code-checkpoint` / `asdl-dev cp` overlap is reconciled, and `/handoff:list` consumes the `handoff list` CLI rather than re-deriving listing in TypeScript.
- The parity-review skill exists, runs both diff-scoped and full-sweep modes, encodes the waiver rule, and a full-sweep run reports no unwaived gaps.
- Evidence: targeted `just ts-check` / `just ts-test` and Python checks pass for changed areas; CLI scenario tests cover each new CLI's operations, help, and version; the parity-review full-sweep output is captured as closure evidence.

## Assumptions and Risks

Assumptions:

- The generic CLI→Pi bridge and shared on-disk skills make parity a fill-the-gaps effort, not a rewrite — each gap is independently closable by extracting orchestration into a CLI + adding a skill, with Pi shrinking to a thin wrapper (validated by the 2026-06-03 audit).
- planned-branch and submit parity are fully owned by their sibling Objectives; this Objective only tracks their rows and adds at most a missing skill pointer.
- Model-text steps can move onto the backend-neutral text-generation abstraction already used by `asdl-dev cp`/`submit`, so slug/summary generation need not stay Pi-locked.
- Genuinely Pi-native primitives (`dispatch_runner_subagent`, `grill_ask` TUI, worktree status line) are acceptable to keep Pi-only provided dependent workflows document an agent-neutral fallback.

Risks:

- `land-stack` carries the most trapped, highest-risk logic (git/GitHub mutations: stack-walk parsing, merge guards, sequenced merge loop). A CLI extraction without faithful, fake-driven guard tests could regress landing safety. De-risk by porting the guards under test before switching Pi over.
- Duplication drift: a Pi extension could keep its TypeScript orchestration after a CLI exists, recreating two implementations (the exact risk `asdl-dev-submit-consolidation` calls out). Mitigated only if the parity-review skill's rubric flags "Pi command whose orchestration duplicates an existing CLI."
- Parity-table rot: the table is worthless if updating it is not enforced. Mitigated by the tracking discipline above and the review skill's full-sweep mode, but it remains a discipline risk.
- Umbrella sprawl: a cross-cutting Objective touching many subsystems can become a never-closing catch-all. Mitigated by fixed completion criteria (no unwaived rows) and by deferring sibling-owned and parked rows rather than absorbing them.
- cmux dispatch portability seam: the extracted CLI must take explicit inputs, but Pi's "latest plan from session history" resolution is genuinely Pi-only. Risk of an awkward core/Pi seam; de-risk by mirroring the `planned-branch-ts-cli` pattern (core takes an explicit slug/path; Pi layer resolves session history over it).

## Open Questions

- For `land-stack`, should the shared CLI be Python (a new `asdl exec` op / package) or TypeScript (a bin, reusing the existing `land-stack/*` implementation like `planned-branch-ts-cli` does)? The existing TS implementation and Graphite-stack semantics argue for TS reuse; the `asdl exec` precedent argues for Python.
- Should the parity-review skill be `internal-*` (repo-private — it references Pi-extension internals) or a public skill? Lean internal.
- Does `/code:changes` deserve any parity, or should it be declared an accepted Pi-only cosmetic affordance (WAIVED) rather than getting a skill?
- What is the severity rubric for the review skill — what distinguishes a "massive feature gap" it must flag from a minor note it merely records?
