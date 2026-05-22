# Branch Memory Plan Storage

## Summary

`/stack-run` now accepts either a local stack-plan draft or an existing Branch Memory plan key. Local plans are validated with the PR 1 schema helpers, stored canonically in Branch Memory namespace `stack-plans` under `<objective>.md` on the starting branch, and hashed from exact content.

Existing Branch Memory content is reused when identical. Differing content fails closed unless the user confirms replacement in UI mode or passes `--replace` in non-UI mode. Existing plan keys load from Branch Memory on the current branch and must match the canonical objective-derived key.

## Objective Impact

PR 2's roadmap row is complete as landed-state evidence: `/stack-run` can store, reuse, replace, or load canonical Branch Memory stack plans without parsing Markdown task sections beyond the literal planned-branch presence checks. Command execution is routed through a small `pi.exec` gateway that reports command, exit code, and trimmed stdout/stderr on failures.

Validation: extension check/test plus `just dprint-check`.

## Follow-Ups

- Use the loaded canonical plan result to select and start the first incomplete slice in the next PR.
- Add recovery/status diagnostics after branch orchestration and closeout exist.
