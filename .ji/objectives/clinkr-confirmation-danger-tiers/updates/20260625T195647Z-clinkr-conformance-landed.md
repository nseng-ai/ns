# Clinkr Confirmation Conformance Landed

## Summary

Added the ADR 0014 conformance audit at `references/clinkr-confirmation-conformance-audit.md` and landed the identified minimal framework + command-local changes. Clinkr now has a handler-returnable `usageError(...)` exit, camelCase `usageError` machine-envelope status/errorType literals, and an injected `ClinkrInteraction.isInteractive()` signal for TTY-gating confirmation prompts without adding danger-tier framework metadata.

Command conformance landed for the prompting destructive commands: `handoff delete` is reclassified as Tier 2 and hard-renamed from `--force`/`-f` to `--yes`/`-y`; `handoff gc` and `slot gc` keep Tier 3 `--force`/`-f`; all three fail fast non-interactively with `usageError` data naming the missing flag. `brmem put` remains a precondition-override `failure(...)`, dry-runs remain `ok(...)`, and no current command requires typed `--confirm`.

Validation evidence: `pnpm --dir ts run check`, `pnpm --dir ts run test`, and `just` pass on this branch.

## Objective Impact

- Roadmap row "Audit Clinkr against the accepted ADR" is complete, evidenced by `references/clinkr-confirmation-conformance-audit.md`.
- Roadmap row "Implement minimal Clinkr framework conformance" is complete, evidenced by the Clinkr `usageError` / `isInteractive` changes, command-local TTY gates, `handoff delete --yes`, and passing validation.
- Roadmap row "Hand the resolved policy back to the parent CLI discipline work" is complete once the parent Objective records this conformance handback.
- The Objective is closure-ready: ADR, audit, implementation, validation, and handback context are all present; broader `sdl-cli-design` skill authoring remains parent scope.

## Follow-Ups

- Author `sdl-cli-design` under `agent-cli-design-discipline`, encoding ADR 0014 and the now-implemented Clinkr conformance surface.
- Keep first-class Clinkr danger-tier metadata/API extraction parked until repeated command evidence justifies it.
- Revisit typed `--confirm <value>` only when a concrete command's blast radius exceeds the current Tier 3 `--force` floor.
