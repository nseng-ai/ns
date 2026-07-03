# Danger-Tier Conformance Handback

## Summary

The focused `clinkr-confirmation-danger-tiers` subobjective completed its ADR 0014 conformance slice. It added a classified audit at `.sdl/objectives/clinkr-confirmation-danger-tiers/references/clinkr-confirmation-conformance-audit.md` and landed the minimal Clinkr + command-local changes needed for the parent CLI discipline to teach the policy against real framework behavior.

Implemented conformance evidence:

- Clinkr has a handler-returnable `usageError(...)` exit channel with camelCase `usageError` machine envelopes.
- `ClinkrInteraction` exposes injected `isInteractive()` so commands can TTY-gate prompts without adding danger-tier framework metadata.
- `handoff delete` is Tier 2 and hard-renamed to `--yes`/`-y`.
- `handoff gc` and `slot gc` remain Tier 3 `--force`/`-f`.
- `handoff delete`, `handoff gc`, and `slot gc` fail fast non-interactively with `usageError` data naming the missing flag.
- `brmem put` remains a `failure(...)` precondition override, dry-runs remain `ok(...)`, and typed `--confirm` stays parked until a concrete command needs it.

Validation evidence: `pnpm --dir ts run check`, `pnpm --dir ts run test`, and `just` pass.

## Objective Impact

The parent roadmap row "Land the high-agreement Clinkr changes accepted by ADRs" is now complete. ADRs 0011, 0013, and 0014 have their accepted Clinkr/runtime conformance implemented with tests, while ADR 0012 intentionally parked output-volume framework features. The remaining active parent work is authoring and registering `sdl-cli-design`, incorporating the ADR outcomes and implemented Clinkr behavior.

The Open Questions handback now records ADR 0014 as both decided and implemented, so `sdl-cli-design` can encode TTY-gated prompting, non-interactive `usageError`, `--yes` vs `--force`, dry-run-as-success, and the absence of first-class danger-tier framework metadata without contradicting Clinkr.

## Follow-Ups

- Author and register the `sdl-cli-design` skill; resolve public-vs-internal placement first.
- In that skill, cite ADR 0014 plus the conformance implementation as the concrete Clinkr behavior for danger-tier guidance.
- Keep output-volume framework features, first-class danger-tier metadata, and typed `--confirm` parked until their recorded evidence thresholds are met.
