# Explicit Branch Context Providers and GS Creation

## Summary

Branch Context creation now resolves an explicit provider lazily instead of constructing Graphite ambiently. The shared `BranchCreationProvider` contract has plain-Git and Graphite adapters with Git-verified postconditions, and Pi presents distinct `/ns:git:*`, `/ns:gt:*`, and `/ns:gs:*` branch-from-plan command pairs. Attached Plan implementation remains provider-independent.

The user approved a course change from the earlier parked-GS boundary: this work also delivers a narrow GitHub Stacks v0.1.0 consumer for local topology inspection and branch creation. It does not deliver reconciliation, submit, land, or publication support.

## Objective Impact

The lazy Branch Context coupling row and the Branch Creation Provider seam row are complete. Plain Git is the portable default and constructs no Graphite gateway; Graphite is selected explicitly. The GS addition validates that branch preparation can be consumed independently of reconciliation and publication, while preserving the capability split required by ADR 0049.

The previous blanket statement that no gh-stack adapter ships here is superseded only for local topology inspection and Branch Context branch creation. The pre-1.0 drift risk remains contained behind the GS package's consumer gateway. Existing Semantic Updates remain unchanged historical records.

## Follow-Ups

- Keep Objective Runner gate replacement and generic Flow trunk discovery as active unrelated rows.
- Keep gh-stack reconciliation, submit, land, and publication in follow-up scope; do not infer parity from the GS creation commands.
- Continue the no-provider audit and discriminated submit/land target work before claiming the Objective completion criteria are met.
