# Objective Pi Adapter Extracted on Feature Branch

## Summary

The first narrow slice of the deferred Pi separation is implemented in the current dirty
feature-branch worktree. The new incubating package
`@nseng-ai/pi-ns-objectives` lives at
`ts/packages/incubating/hosts/pi/extensions/pi-ns-objectives/`; the project-local
`.pi/extensions/objective.ts` discovery adapter loads its `./extension` export, and the
package preserves the `/ns:objective:*` command family with package-owned tests and parity
metadata.

Concrete boundary evidence shows that `@nseng-ai/objectives` no longer exports or declares a
`pi` subpackage and no longer carries the Pi-runtime peer. Its former Pi implementation and
tests have moved to the adapter, whose implementation imports Objective behavior through the
curated `@nseng-ai/objectives/api` surface. Objective command-backed skill registrations were
also exposed through that API so the skill-exposure consumer no longer imports an Objectives
Pi surface. The local `.pi/extensions/objective-autorun.ts` artifact remains separate and
continues to own only the provisional `objective_runner_step` tool.

## Objective Impact

This advances only the Objective adapter portion of the broad deferred extraction row. It
demonstrates the approved `pi-ns-<domain>` package shape and removes Pi ownership from the
Objectives ns extension without redefining Objective domain semantics. The package is not
landed or published, and this evidence does not complete the roadmap row or the Objective.

Current implementation evidence includes the new package manifest and exports, moved adapter
source and Pi tests, the Objective API import boundary, updated project-local workspace
resolution, and `@nseng-ai/pi-ns-objectives` parity ownership. Validation available in the
worktree includes the existing package test suite moved with the adapter and the Objectives
API unit assertion for host-neutral command-backed skill registrations; validation results
are reported by the implementing session rather than inferred here.

## Follow-Ups

- Extract the remaining Flow, Handoff, Branch Context, and Herdr Pi integrations into their
  approved host-owned packages using only curated extension APIs.
- Extract or classify the remaining Pi-native `harness-session`, `model-shortcuts`, and
  `worktree-status` implementations.
- Implement and validate the final structural guards prohibiting Pi surfaces in ns extensions
  and enforcing the `pi-ns-*` adapter boundary.
- Reconfirm full repository validation at the final stack tip, land the coordinated boundary,
  and reconcile the parent Objective afterward; do not claim publication without registry
  evidence.
