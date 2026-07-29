# Review Harness Diagnostics Centralized

## Summary

The first high-severity finding is fixed in Runner Checkpoint commit `461daa9199948299d8ac28294e0fb5301823d91f`. A Reviews-owned `reviewHarnessExecutionMessage` helper now owns shared `ExecResult` diagnostic interpretation across the Claude Code, Codex, and Pi gateways. The gateways retain their provider invocation and output-parsing responsibilities while supplying only the harness label and whether the existing stdout-last-line fallback applies.

The accepted slice preserves trimmed stderr precedence, Claude Code and Pi stdout fallback, Codex's lack of stdout fallback, spawn-failure text, cancellation and timeout text, exit status, signal formatting, and unknown-status behavior. Focused characterization tests cover those policy variations.

Runner-attested verification confirmed the implementation branch, unchanged pre-finish HEAD, clean index, non-empty candidate diff, Graphite tracking, and `git diff --check`. The child additionally reported that Reviews package formatting, lint, typecheck, and 276 tests passed, followed by the default `just` validation with 168 style-guard tests and 5,987 default tests passing; those command-result details remain child-reported rather than runner-attested.

## Objective Impact

The roadmap finding “Centralize review-harness execution diagnostics across Claude Code, Codex, and Pi gateways” is recorded fixed. One canonical Reviews owner now replaces the three repeated diagnostic cascades at the audited sites, with exact provider-specific behavior retained. Five findings remain open.

## Follow-Ups

- Continue with the next lowest-coupling finding: Flow pending-worktree failure semantics.
- Keep later findings to one complete disposition per accepted autorun slice.
