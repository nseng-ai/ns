# Added parity-review skill

## Summary

Added `internal-code-parity-review` as a repo-private skill and installed it for Codex/Claude discovery. The skill defaults to a diff-scoped review of the current branch/worktree, supports an explicit full-sweep inventory, treats live repo evidence as authoritative, and reviews direct Pi command registration, CLI-bridge registration, and custom tool registration for cross-harness reachability.

The skill is advisory rather than merge-blocking. It encodes finding categories (`major gap`, `discoverability gap`, `table drift`, `waiver check`, `note`, `covered`), a risk-based rubric for when shared CLI extraction is likely needed, CLI-bridge treatment for generated Pi commands, and WAIVED handling for Pi-native UI/session primitives with agent-neutral fallbacks. It also requires a new Semantic Update whenever parity review edits Objective tracking or `parity-table.md`.

Validation evidence for this slice included internal skill install checks, symlink layout checks, a diff-scoped smoke review showing this implementation introduced no new Pi command/tool surface, and a full inventory recipe run over `ts/packages/pi-extensions/src` that reached the expected `pi.registerCommand`, `registerCliCommandExtension`, and `registerTool` registration sites.

## Objective Impact

The durable parity-review skill roadmap row is complete. The internal-vs-public decision is resolved as `internal-code-parity-review` with `metadata.internal: true`, because the workflow references repo-local Pi extension internals and Objective tracking files.

This reduces the parity-table rot risk by giving future agents a durable review workflow for diff-scoped changes and explicit full-sweep checks. It does not eliminate the risk unless agents consistently use the skill, and it does not close the remaining orchestration gaps.

## Follow-Ups

- Continue with open parity gaps: `land-stack`, cmux dispatch/open-branch, `autobranch`, `/code:land`, and `/code:changes`.
- Consider the parked manifest/CI parity gate only in a separate future objective/slice.
- Refine the advisory severity rubric if future parity reviews reveal unclear thresholds.
