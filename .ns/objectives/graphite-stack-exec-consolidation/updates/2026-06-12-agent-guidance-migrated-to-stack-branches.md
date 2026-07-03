# Agent Guidance Migrated to `stack-branches`

## Summary

Agent-facing guidance that previously directed machine stack-topology decisions through human Graphite output has been migrated to the canonical structured helper. `stack-address` now verifies and pipes `slot gt exec stack-branches` into `pr-address exec map-branch-prs --format json` for strict open-PR coverage. The PR-address `map-branch-prs` reference now names that zero-jq pipeline as the recommended Graphite-stack invocation while preserving the helper's Graphite-neutral contract and manual/direct branch JSON path. The delete-stack workflow now routes current-stack discovery through `slot gt exec stack-branches`; remaining `gt branch info`, `gt ls`, and `gt log` mentions in that edited path are visual/advisory confirmation or verification-only, not machine-parsed topology sources.

Validation: focused ripgrep checks found no remaining `gt ls --stack` branch-list guidance in the edited skill paths, the broader Graphite-reference check shows structured-helper usage plus only visual/advisory or verification `gt` text in those paths, and `just dprint-check` passed.

## Objective Impact

The roadmap row “Replace agent-facing `gt ls --stack` parsing guidance” is complete. This also advances the completion criteria that stack-address no longer instructs agents to build branch lists from `gt ls --stack`, and that agent references using `gt ls`/`gt log` for machine decisions are audited and either migrated to structured helpers or constrained to human visual confirmation.

The Objective remains open: stack-address preflight mechanics still need broader consolidation, additional `slot gt exec` candidates remain to audit, the TypeScript `asdl-dev submit` parser decision is still pending, and the final documentation loop remains separate.

## Follow-Ups

- Design the stack-address preflight consolidation around the now-documented `slot gt exec stack-branches | pr-address exec map-branch-prs --format json` pipeline.
- Decide whether broader Graphite stack-info/status helpers are needed beyond `stack-branches`.
- Resolve the `asdl-dev submit` `gt log --stack` parser path.
