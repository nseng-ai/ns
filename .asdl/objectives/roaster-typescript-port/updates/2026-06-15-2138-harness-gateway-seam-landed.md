# Harness Gateway Seam Landed

## Summary

The TS roaster Claude Code harness seam is now implemented. The port has a semantic `HarnessGateway`, an in-memory fake, a real adapter backed by injected `CommandExecApi`, stdin-capable shared exec support for prompt delivery, copied prompt assets, pure prompt/diff/schema/output helpers, and deterministic unit/scripted-runner coverage. The real adapter validates Claude model names, resolves the `claude` binary before spawning, keeps `--tools Bash,Read --model ...` ordering, sends the user prompt through stdin, handles non-zero exits before JSON parsing, and parses `structured_output` findings from Claude JSON output.

Evidence: local branch diff against Graphite parent `roaster-shared-github-cli-helpers`; PR #1642 (`Add harness gateway support and shared GitHub exec helpers`) corroborates the harness file set. Verification: targeted core/roaster package checks and tests passed, and full `just` passed.

## Objective Impact

This completes the dedicated Claude Code harness roadmap row for the decided two-layer seam. It also advances the domain/error-model row with harness-specific request/response schemas and the `review_execution_empty_output` failure variant, but does not complete the broader CLI envelope or marker model.

The harness-fidelity risk is materially de-risked for local TypeScript behavior and Claude wire-format parsing, while real Claude Code and CI end-to-end drift remain open until `roaster review run` is wired and exercised by the TS CI flow on a real PR.

## Follow-Ups

- Wire the implemented harness seam into `roaster review run` in a later CLI parity slice.
- Exercise the TS roaster flow against real Claude Code during CI cutover or an explicitly gated smoke test.
- Keep the Python roaster package until the TS CLI and workflow cutover are proven green end to end.
