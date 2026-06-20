# Documentation Loop Closed

## Summary

Closed the remaining documentation/guidance loop for Graphite stack topology decisions. Repo-wide Graphite guidance now states that agents must not parse human-facing `gt ls`, `gt ls --stack`, `gt log`, or `gt branch info` output for machine topology decisions; those commands are reserved for human visual confirmation, diagnostics, or verification.

Guidance migrations completed:

- `skills/objective-update/SKILL.md`: Graphite base discovery now uses `gt parent --no-interactive` instead of extracting `Parent: <branch>` from `gt branch info`.
- `skills/code-workflows/references/parity-review.md`: branch diff-base evidence now uses `gt parent --no-interactive` and points current-stack topology decisions to `slot gt exec stack-branches` / `--format json`.
- `skills/code-gt-restack-resolve/SKILL.md`: restack scope gating now uses `gt children --no-interactive`; richer topology points to `slot gt exec stack-branches --format json`; remaining `gt ls` / `gt log` uses are explicitly visual-confirmation-only.
- `AGENTS.md`: the repo-wide Runtime Graphite Dependency Boundary now records the no-display-parsing rule and the structured/plumbing alternatives.

Validation: `just dprint-check` passed.

## Objective Impact

The final roadmap row, “Close the documentation loop,” is complete. The Objective's display-output-parsing completion criterion is satisfied for agent-facing guidance: machine topology decisions route to `slot gt exec stack-branches`, `gt parent --no-interactive`, or `gt children --no-interactive`; display output is limited to human visual confirmation, diagnostics, or submit-specific retained gateway parsing documented in the prior update.

No additional `slot gt exec` command was spawned by this slice.

## Follow-Ups

- The Objective appears ready for an explicit Objective Close pass: all non-parked roadmap work is complete, open questions are resolved, and only parked unrelated follow-ups remain.
