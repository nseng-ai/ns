# Roadmap

## Work

- [x] Write the confirmation/danger-tier ADR.
  - Recorded as `docs/adr/0014-clinkr-confirmation-danger-tiers.md`: four danger tiers (0 read-only, 1 scoped/reversible, 2 destructive/external, 3 high blast radius), non-interactive fail-fast behavior, TTY-gated prompts, dry-run/preview returning `ok(...)`, and the `--yes`/`-y` (Tier 2) versus `--force`/`-f` (Tier 3) verb split.
  - Tier 3 standardizes on `--force`/`-f`, matching the existing `-f`/`--force` convention on `brmem put`, `handoff delete`, `handoff gc`, `slot gc`.
  - Dissent preserved: first-class Clinkr danger metadata versus command-local flexibility; generic-`--yes`-for-Tier-3 and typed-confirmation-for-all-Tier-3 both recorded as rejected alternatives.
- [ ] Audit Clinkr against the accepted ADR.
  - Compare current confirmation/interaction behavior, rendered command options, machine-envelope behavior, and schema surfaces to the policy.
  - Identify the minimal framework/runtime/schema/test deltas needed for conformance, or explicitly justify why no framework code change is appropriate.
- [ ] Implement minimal Clinkr framework conformance.
  - Make the smallest appropriate code and test changes so Clinkr behavior matches the accepted policy.
  - Evidence: targeted tests and relevant repo checks pass for the touched Clinkr/code paths.
- [ ] Hand the resolved policy back to the parent CLI discipline work.
  - Update or otherwise leave clear context for `agent-cli-design-discipline` so `sdl-cli-design` can encode the danger-tier policy without contradicting the implemented framework behavior.

## Parked

- [ ] First-class Clinkr danger-tier metadata/API extraction, unless the ADR/audit proves it is required by this slice.
- [ ] Repo-wide migration of every existing destructive SDL command, unless a concrete mismatch blocks policy/framework conformance.
- [ ] Full `sdl-cli-design` authoring beyond the danger-tier policy needed to unblock the parent Objective.
