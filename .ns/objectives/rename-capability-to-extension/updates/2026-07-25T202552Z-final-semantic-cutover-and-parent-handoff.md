# Final Semantic Cutover and Parent Handoff

## Summary

The remaining live semantic prose cutover is complete. The final pass updated:

- `docs/north-star.md` to describe skills as driving an ns extension;
- `docs/conventions/subpackage-conventions.md` to use **extension package API** consistently for the required literal `/api` door;
- `docs/conventions/adversarial-reviews.md` to name the Reviews extension;
- `docs/pi/README.md` to name the Handoff extension package API and Herdr extension adapters;
- `skills/ns-typescript/SKILL.md` to name `ctx.extensions` directly and distinguish typed SDK or ns-extension values from extension package API parameters; and
- the parent umbrella's `references/root-readme-positioning.md` to present **the core**, **ns extensions**, **Pi extensions**, tools, skills, and one **presentation taxonomy** without using capability as an ns category noun.

The bounded final search retained only semantically valid cases: generic functional-area language in `skills/skill-management/references/umbrella-families.md`; the user-visible branch-retrospective ability and ADR 0037 functionality-availability wording in `docs/pi/README.md`; the literal `ctx.renderCapabilities: RenderCapabilities` symbols and `ns.clinkr.caps` key; and the parent reference's explicitly qualified model-capability claim.

## Parent Handoff

The machine-readable cutover had already landed in commit `4afa42169` and ADR 0044. The package is `@nseng-ai/extension-kit`; the canonical tiers are `extension` and `extension-kit`; Extension Kit remains in the clean zone; and the 11 first-party ns extensions live directly under the path-derived incubation zone:

- Branch Context
- Flow
- Handoffs
- Harness Artifacts
- Herdr
- ns Init
- Objectives
- Plans
- PR Feedback
- Reviews
- Slots

There is no intermediate `extensions/` directory and no tracked legacy capability package path. The parent umbrella can consume this roster and the reconciled positioning reference while it continues the independent host/tool placement, zone-invariant, README, and transfer work.

## Validation

- The bounded scoped terminology search was rerun and every remaining match was classified.
- `dprint check` passed for all scoped documentation and skill files.
- `just` passed, including the TypeScript style guard, dependency check, formatting, lint, typecheck, 569-file default Vitest suite, and repository-wide Objective edge sweep.
- `ns objective check rename-capability-to-extension` passed after the tracking and closure changes.

## Objective Impact

All roadmap rows and completion criteria are satisfied. No material capability-to-extension rename work remains, so the Objective closes as completed. Historical ADRs, immutable Semantic Updates, dated records, external language, generic ability/support prose, and literal code symbols remain unchanged by design.

## Follow-Ups

- The parent umbrella independently owns the remaining host/tool placement, zone-invariant, README, checkout-free PR Feedback, hardening, and transfer work.
- No follow-up remains under this Objective.
