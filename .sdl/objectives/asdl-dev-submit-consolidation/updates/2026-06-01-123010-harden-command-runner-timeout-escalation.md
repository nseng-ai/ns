# Harden Command-Runner Timeout Escalation

## Summary

The shared `command-runner` gateway in `ts/packages/asdl-dev/` now enforces timeout
completion robustly instead of relying on a single best-effort `SIGTERM`. `runCommand`
gained a `CommandRunnerOptions.timeoutKillGraceMs` knob: on timeout it sends `SIGTERM`,
then escalates to `SIGKILL` after the grace window (default 5s; an immediate `SIGKILL`
when the grace is `<= 0`). Timed-out runs are normalized to exit code 124 and reported
as `killed`. The hardening lives entirely in the generic runner — no submit-specific
process machinery was reintroduced.

New `command-runner` tests cover the four relevant paths: normal close (output + exit
code preserved), startup error (127 + `startupError`), timeout resolved when the child
handles `SIGTERM`, and timeout escalated to `SIGKILL` when the child ignores `SIGTERM`.
Targeted `bun test` for the file passed (4/4) and the package typecheck (`tsc --noEmit`)
passed.

Evidence: PR #787 ("Add SIGKILL escalation grace period to command timeout handling with
tests"), branch `harden-asdl-dev-runcommand-timeouts-sigterm-sigkill` diffed against its
Graphite parent `consolidate-submit-to-asdl-dev-timeout-semantics`. Recorded under
landed-state semantics: the PR is open and marked ready to merge as a stack, and this
records the post-merge trunk state.

## Objective Impact

- Roadmap "Harden shared command timeout handling for long-running Graphite commands"
  moves from `[ ]` to `[x]`; this satisfies the Completion Criterion on robust timeout
  enforcement with SIGTERM escalation and anti-hang tests.
- The risk "shared runner hardening may affect other `runCommand` callers" is
  substantially de-risked: the change is additive behind an optional grace knob, so
  existing callers keep working.
- The Open Question on SIGTERM→SIGKILL blast radius is resolved: the fallback is
  backwards-compatible and no caller depended on the prior weaker behavior.

## Follow-Ups

- None specific to the runner. Remaining Objective work is unchanged: typed semantic
  submit gateway causes, the thin-Pi-UX-wrapper decision, and the strict code-quality
  review re-run against the hardened consolidation.
