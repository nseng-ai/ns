# Roadmap

## Work

- [ ] Write the confirmation/danger-tier ADR.
  - Capture the tier model, non-interactive fail-fast behavior, prompt rules, `--yes` semantics, `--force` semantics, dry-run/preview expectations, and the accepted Tier 3 stance that generic `--yes` may be valid when paired with clear safeguards.
  - Preserve dissent for first-class Clinkr danger metadata versus command-local flexibility.
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
