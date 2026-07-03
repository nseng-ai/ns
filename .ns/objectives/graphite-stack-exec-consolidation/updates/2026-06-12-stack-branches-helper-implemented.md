# `slot gt exec stack-branches` Implemented

## Summary

The canonical structured Graphite stack branch helper is implemented under the explicit Graphite boundary `slot gt exec stack-branches`. The helper emits compact pipe-safe branch JSON by default, supports the richer JSON envelope with trunk/current/scope/warnings diagnostics, includes the current branch while excluding trunk, and supports `--downstack` for the unambiguous trunk-to-current path.

The implementation uses structured `StackInfo.diagnostics` to fail closed for scope-relevant fork, cycle, missing-row, and trunk-marker hazards instead of parsing human warning strings. Branch evidence: local branch diff against `gt-stackinfo-structured-walk-diagnostics`; PR #1338 corroborates the same file set. Verification recorded by the branch: targeted asdl-slots scenario/unit suite passed, `just fix`, `just ty`, and full `just test` passed.

## Objective Impact

The implement-and-test roadmap row is complete. The first two completion criteria now have implementation evidence: agents have a canonical command for current-stack branch discovery, and the command contract is documented and tested across ordering, current inclusion, trunk exclusion, negative current-on-trunk behavior, untracked and inconsistent metadata failures, warnings, fork ambiguity, and `--downstack` behavior.

The Objective is not ready to close: agent-facing skill/reference migration, stack-address preflight consolidation, additional `slot gt exec` candidate audit, the TypeScript submit parser decision, and the documentation loop remain active roadmap work.

## Follow-Ups

- Replace stack-address and related PR-address guidance that still derives machine topology from `gt ls --stack` with `slot gt exec stack-branches`.
- Design the stack-address preflight consolidation around the new pipe-safe branch JSON contract.
- Decide whether any broader Graphite stack-info/status helper is still needed now that the branch helper exists.
