# Roadmap

## Work

- [x] Seed the living parity table (`parity-table.md`) from the 2026-06-03 cross-harness audit: one row per Pi command/tool with shared CLI backing, driving skill, parity verdict (FULL/PARTIAL/NONE/WAIVED), and owning Objective. Evidence: `parity-table.md` exists and classifies the audited current Pi surfaces; removed surfaces are deleted during refreshes rather than retained as stale FULL rows.

- [x] Close the `asdl-dev` discoverability gaps: author thin skills surfacing `asdl-dev preview-url`, `cp`, and `submit` to Claude/Codex (describing CLI operations only), and reconcile the `internal-code-checkpoint` vs `asdl-dev cp` duplication (decide whether the skill wraps the CLI or the two are explicitly distinct, and record the decision). Evidence: `dev-preview-url` and `internal-code-submit` were added as thin CLI-driving skills; `internal-code-checkpoint` now delegates to `asdl-dev cp`; the parity table's three `asdl-dev` rows moved to FULL.

- [x] Eliminate the `/handoff:list` duplication: point the Pi command at the dedicated `handoff list --format json` CLI and keep only the card renderer in TypeScript, removing the TS re-derivation of listing/preview over raw `brmem list`. Evidence: `/handoff:list` now calls `handoff list --branch/--all --format json`; the parser accepts the CLI `handoffs` array while preserving legacy `entries` compatibility; branch-state/`--include-deleted` are available in the CLI; targeted `bun test test/handoff.test.ts` passed for the Pi handoff extension.

- [x] Author the durable parity-review skill: diff-scoped mode flags any added/changed Pi command or tool lacking a CLI+skill counterpart (or a recorded waiver); on-demand full-sweep mode checks and refreshes the parity table. Encode the WAIVED rule for Pi-native primitives (acceptable only with a documented agent-neutral fallback) and a severity rubric for "massive feature gap" vs note. Evidence: `internal-code-parity-review` exists as an installed internal skill for Codex/Claude; it documents default diff-scoped and explicit full-sweep modes, live-evidence-first inventory over `pi.registerCommand` / `registerCliCommandExtension` / `registerTool`, CLI-bridge treatment, custom-tool waiver guidance, advisory finding labels, and Objective table sync with a required Semantic Update; manual smoke on the implementation branch confirmed no new Pi command/tool surface was introduced and the full inventory recipe reaches the expected registration sites.

- [ ] Implement parity-native command-output summaries as a shared CLI/helper. Evidence: the contract names command/cwd/timeout/cancellation semantics, shell/argv invocation modes, outcome taxonomy, payload artifact log paths, bounded human and machine-readable summaries, profile-derived counts/excerpts for generic/test/lint/typecheck output where practical, no-leak guarantees, and skill guidance plus optional Pi adapter that wraps the same helper instead of becoming canonical.

- [ ] Push `land-stack` down into a test-backed shared CLI (stack-walk parsing, merge/preflight guards, restack/submit-requirement detection, worktree-conflict handling, sequenced per-PR merge loop), then add a skill and refactor `/code:land-stack` to import/mirror the core with no duplicated orchestration. Resolve the Python-vs-TS home question first. Evidence: CLI scenario + fake-driven guard tests; Claude/Codex can land a stack via the skill; Pi carries no duplicate logic.

- [ ] Push the cmux dispatch orchestration down into a shared CLI that takes explicit inputs (plan-file path, prompt) instead of reading Pi session state, with an agent-neutral launch path (not a hardcoded `pi @file`); cover `/cmux:workspace:dispatch-plan`, `/cmux:workspace:dispatch-prompt`, and a thin skill for the `/cmux:workspace:open-branch` (`slot checkout` + `cmux new-workspace`) pairing. Pi keeps only session-history "latest plan" resolution over the core. Evidence: a Claude/Codex agent can dispatch a branch/plan into a cmux slot via skill+CLI; cmux rows move off NONE.

- [ ] Push `autobranch` down into `asdl-dev autobranch` (stash → `gt create` → restore → checkpoint commit, plus branch-name selection), routing slug generation through the backend-neutral text-generation abstraction; add a skill and refactor `/code:autobranch` to mirror it. Evidence: `asdl-dev autobranch` runnable headlessly; scenario tests; skill drives it.

- [ ] Provide skill-only parity for `/code:land` and decide `/code:changes`: a skill documenting the single-PR land contract over `gh` (base-must-be-trunk guard, `--match-head-commit` pinning, PR title/body as commit message); for `/code:changes`, either a lightweight summary skill or a recorded WAIVED row if judged purely cosmetic. Evidence: parity table's `land`/`changes` rows reach FULL or WAIVED.

## Parked

- [ ] Machine-checkable CI parity gate: a parity manifest (Pi command → skill/CLI) plus a deterministic check that fails CI when a Pi command lacks a counterpart. Later hardening of the parity-review skill; design the manifest format first.
- [ ] Broad automatic bash-output interceptor or framework-wide output safety net.
- [ ] Pi-only runner-subagent test-summary tool as the canonical command-summary implementation.
- [ ] LM/subagent semantic interpretation of command logs as the default summarizer.
- [ ] Migration of every validation command or package workflow to command-output summaries.
- [ ] Payload retention, garbage collection, durable archive policy, or strict numeric token-budget tests for command logs.
