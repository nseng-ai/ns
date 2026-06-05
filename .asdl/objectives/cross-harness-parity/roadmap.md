# Roadmap

## Work

- [x] Seed the living parity table (`parity-table.md`) from the 2026-06-03 cross-harness audit: one row per Pi command/tool with shared CLI backing, driving skill, parity verdict (FULL/PARTIAL/NONE/WAIVED), and owning Objective. Evidence: `parity-table.md` exists and classifies all ~27 surfaces.

- [ ] Close the `asdl-dev` discoverability gaps: author thin skills surfacing `asdl-dev preview-url`, `cp`, and `submit` to Claude/Codex (describing CLI operations only), and reconcile the `internal-code-checkpoint` vs `asdl-dev cp` duplication (decide whether the skill wraps the CLI or the two are explicitly distinct, and record the decision). Evidence: a Claude/Codex agent can run each command from a skill; the parity table's three `asdl-dev` rows move to FULL.

- [ ] Eliminate the `/handoff:list` duplication: point the Pi command at the dedicated `handoff list --format json` CLI and keep only the card renderer in TypeScript, removing the TS re-derivation of listing/preview over raw `brmem list`. Evidence: `/handoff:list` consumes `handoff list`; branch-state/`--include-deleted` are available; ts-test passes.

- [ ] Author the durable parity-review skill: diff-scoped mode flags any added/changed Pi command or tool lacking a CLI+skill counterpart (or a recorded waiver); on-demand full-sweep mode regenerates the parity table. Encode the WAIVED rule for Pi-native primitives (acceptable only with a documented agent-neutral fallback) and a severity rubric for "massive feature gap" vs note. Decide `internal-*` vs public. Evidence: the skill runs in both modes; a full-sweep over the current repo reproduces the seeded table.

- [ ] Push `land-stack` down into a test-backed shared CLI (stack-walk parsing, merge/preflight guards, restack/submit-requirement detection, worktree-conflict handling, sequenced per-PR merge loop), then add a skill and refactor `/code:land-stack` to import/mirror the core with no duplicated orchestration. Resolve the Python-vs-TS home question first. Evidence: CLI scenario + fake-driven guard tests; Claude/Codex can land a stack via the skill; Pi carries no duplicate logic.

- [ ] Push the cmux dispatch orchestration down into a shared CLI that takes explicit inputs (plan-file path, prompt) instead of reading Pi session state, with an agent-neutral launch path (not a hardcoded `pi @file`); cover `/cmux:workspace:dispatch-plan`, `/cmux:workspace:dispatch-prompt`, and a thin skill for the `/cmux:workspace:open-branch` (`slot checkout` + `cmux new-workspace`) pairing. Pi keeps only session-history "latest plan" resolution over the core. Evidence: a Claude/Codex agent can dispatch a branch/plan into a cmux slot via skill+CLI; cmux rows move off NONE.

- [ ] Push `autobranch` down into `asdl-dev autobranch` (stash → `gt create` → restore → checkpoint commit, plus branch-name selection), routing slug generation through the backend-neutral text-generation abstraction; add a skill and refactor `/code:autobranch` to mirror it. Evidence: `asdl-dev autobranch` runnable headlessly; scenario tests; skill drives it.

- [ ] Provide skill-only parity for `/code:land` and decide `/code:changes`: a skill documenting the single-PR land contract over `gh` (base-must-be-trunk guard, `--match-head-commit` pinning, PR title/body as commit message); for `/code:changes`, either a lightweight summary skill or a recorded WAIVED row if judged purely cosmetic. Evidence: parity table's `land`/`changes` rows reach FULL or WAIVED.

## Parked

- [ ] Machine-checkable CI parity gate: a parity manifest (Pi command → skill/CLI) plus a deterministic check that fails CI when a Pi command lacks a counterpart. Later hardening of the parity-review skill; design the manifest format first.
