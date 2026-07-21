# Clean Landing Adopted for Slots Consumer Contracts

## Summary

The open probe-iteration stack is superseded by a clean two-PR replacement. The first PR establishes this rebaselined cross-consumer coordination Objective on current `master`; its child will compose Pi-hosted Herdr with the complete ns extension API and deliver optional compact Slot label enrichment without a command-surface probe.

Historical design and test evidence remains recoverable at these exact PRs, branches, and commits:

- PR #3764, `customized-naming-conventions`, `5fd5dc2fb1ce827238626d1306d9323dc742333c`
- PR #3768, `coordinate-slots-consumer-contracts`, `27db664807b35169c6ffb679359f7b12f0047d0d`
- PR #3769, `herdr-optional-slot-label-enrichment`, `1d9aea0f4e1e650d40152ece62fa1279caeef8e3`
- PR #3772, `wire-herdr-extension-api`, `6911515bbb7521a18fbd804ac1514eec21630e0a`

Those PRs will be closed as superseded after the replacement Objective PR is submitted. Their exact local and remote branches will then be deleted and `slot-08` freed; the historical PR records remain evidence and will not be reshaped or merged.

## Objective Impact

This update records coordination and recoverability only. The Herdr roadmap row remains open, and this PR does not claim implementation delivery.

The Objective is rebaselined to current ns SDK/host and resource-first Herdr terminology. The former cmux capability is accounted for as a completed retirement and migration relationship, proved by current source and the `retire-cmux-herdr-handoff-namespace` Objective, rather than retained as work against deleted package and adapter surfaces. The linked `flow-slots-opt-in` Objective remains the focused owner of Flow's optional-Slots migration; this Objective owns cross-consumer accounting and final synthesis.

## Follow-Ups

- Submit this Objective-only replacement PR rooted directly on `master`.
- Close the four superseded PRs with pointers to the replacement, free `slot-08`, and delete only the four exact local and remote branches listed above.
- Implement the child PR, then mark only the Herdr roadmap row complete and add a new immutable Semantic Update containing behavior, test, and PR evidence.
- Keep broader Flow, hard-dependency, Graphite-topology-owner, durable-accounting, and final-synthesis rows open until their own evidence exists.
