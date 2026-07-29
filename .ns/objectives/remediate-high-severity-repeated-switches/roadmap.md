# Roadmap

## Work

- [x] Centralize review-harness execution diagnostics across Claude Code, Codex, and Pi gateways.
  - Policy: direct execution after preview; preserve exact stderr/stdout fallback and diagnostic text per harness. Stop if consolidation requires changing provider gateway contracts.
  - Evidence: one Reviews-owned diagnostic helper owns shared `ExecResult` interpretation; all three gateways use it; focused Reviews tests and relevant checks pass.
- [x] Centralize Flow pending-worktree failure semantics across autobranch, checkpoint, and house-style presentation.
  - Policy: direct execution after preview; preserve exact plain messages, Git commands, command-aware headlines, and transcript details.
  - Evidence: one Flow-owned kind projection owns shared message/command/headline facts; all four verified cascades consume it; focused Flow tests and relevant checks pass.
- [x] Centralize Foundation `ExecResult` termination policy.
  - Policy: direct execution after preview; retain current public helper signatures and exact output text.
  - Evidence: one private exhaustive classifier owns success, startup-versus-termination, and canonical termination facts; the three public helpers consume it; focused Foundation tests and relevant checks pass.
- [ ] Centralize context-profiler `MessagePart` semantics.
  - Policy: direct execution after preview; preserve normalized rendering, character accounting, excerpt generation, and tool-name behavior exactly.
  - Evidence: one exhaustive facts projection owns each message-part variant's semantic contributions; all verified consumers use it; focused pi-tools tests and relevant checks pass.
- [ ] Centralize Branch Context creation-policy interpretation.
  - Policy: direct execution only while a package-local descriptor can preserve preview, failure, and execution behavior exactly. Skip and stop if policy normalization becomes design-bearing.
  - Evidence: one Branch Context-owned descriptor or basis owns Git/Graphite mode, start-point source, HEAD behavior, and parent behavior; verified consumers use it; focused Branch Context tests and relevant checks pass.
- [ ] Centralize release-reset action semantics.
  - Policy: direct execution only while core action handling can preserve exact execution, failure classification, defensive copying, and CLI presentation. Skip and stop if a broader visitor/framework decision is required.
  - Evidence: release core owns canonical action copying and shared execution/failure metadata; duplicate CLI copying is removed; focused ns-dev tests and relevant checks pass.

## Parked

- The eight medium-severity and one low-severity findings from the same Repeated Switches audit.
- Any fresh findings discovered after this Objective's fixed six-finding backlog was created.
- Behavior, diagnostic-copy, public-surface, or error-semantics improvements beyond exact-preservation refactoring.
