# Semantic Update: restack-resolve CLI core implemented

## Summary

Implemented the deterministic `ns gs restack-resolve` CLI-owned slice. The command selects start or continuation from observed Git state, supports full and explicit downstack dry-run/start scopes, advances public gh-stack at most once, requires `--yes` outside an interactive terminal, and returns bounded postcondition and recovery evidence.

The implementation adds separate GS-owned provider and Git Consumer Gateways, real ns composition, constructor-state in-memory implementations, focused workflow/provider/CLI tests, and an integration-lane smoke that runs a clean local cascade in a disposable no-remote repository when exact gh-stack v0.1.0 is installed. Every `gh stack` subprocess now uses the ns exec environment-overlay seam with `GH_PROMPT_DISABLED=1`, `GIT_TERMINAL_PROMPT=0`, `GIT_EDITOR=true`, and `GIT_SEQUENCE_EDITOR=true`; the host preserves all other caller environment values. No `env` executable wrapper, private provider-state access, networked provider operation, raw Git continuation, automatic loop, abort, push, or GitHub mutation is used.

## Objective Impact

The CLI core portion of the restack-resolve roadmap row is implemented. The command supports exactly gh-stack v0.1.0 and deliberately does not fetch or integrate trunk. The row remains `[~]` because the portable skill and Pi surface are not part of this change.

## Follow-Ups

Add the portable GS skill and thin `/ns:gs:restack-resolve` Pi router, including sequential conflict-resolution, parity, and routing evidence.
