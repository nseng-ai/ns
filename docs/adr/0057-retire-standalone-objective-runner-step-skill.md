# ADR 0057: Retire the standalone Objective Runner step skill

## Status

Accepted

Supersedes ADR 0050 only where that decision retained the standalone `objective-runner-step` skill. ADR 0050's portable autorun decision and the Objective Runner decisions in ADRs 0024 and 0037 remain accepted.

## Context

ADR 0050 made `objective-autorun` the self-contained primary orchestration surface. In `ns-bookended` mode, it directly owns the strict ADR 0024 `runner-begin` → harness dispatch → `runner-finish` procedure. The separate `objective-runner-step` skill described the same procedure for exactly one step.

Keeping two procedural sources creates drift risk and adds a separately discoverable and installable artifact without adding runtime behavior. This repository is private and unreleased, so no compatibility artifact is required.

## Decision

Retire the standalone `objective-runner-step` skill completely. Remove its canonical source, Harness Overlays, local acquisition lock entry, package provisioning declaration, and current product documentation. Do not provide an alias, stub, redirect, or compatibility copy.

`objective-autorun` remains the parent-facing workflow for both portable and ns-bookended execution. A parent that needs one strict bookended step uses one iteration of its ns-bookended procedure.

This retirement does not change the Objective Runner protocol. Retain:

- `ns objective exec runner-begin` and `runner-finish`;
- runner-attested Runner Checkpoints and runner-owned provenance commits;
- the Objective Runner and Runner Checkpoint vocabulary;
- portable and ns-bookended `objective-autorun` modes; and
- ADR 0037's parent-only publication boundary after a real committed Runner Checkpoint.

## Consequences

- Harnesses and extension installs no longer discover, provision, list, or package `objective-runner-step`.
- Bookended execution has one procedural source in `objective-autorun`, reducing drift.
- Callers no longer invoke a standalone one-step skill; they use the ns-bookended autorun procedure with a one-step ceiling when only one iteration is wanted.
- ADR 0050 remains historical evidence of the earlier retention decision. This ADR records the later, narrow supersession.
- Objective Runner TypeScript, command contracts, attestation, checkpoint semantics, and publication behavior are unchanged.

## Alternatives

- **Deprecate but retain the skill:** rejected because it preserves the duplicate installable artifact and procedural source.
- **Rename or redirect the skill:** rejected because compatibility is unnecessary before release and would keep a second identity discoverable.
- **Remove the strict bookended workflow:** rejected because the retirement concerns only the duplicate skill artifact, not Objective Runner capability.
