# Extension List Read Model Complete

## Summary

The customer-facing `ns extension list` surface is implemented as a Tier-0 repository inspection command. It returns one ordered row per top-level `ns.toml` extension declaration and separates acquisition state (`installed`, `missing`, or `invalid`) from artifact state (`none`, `provisioned`, `needs-reconcile`, `conflicted`, or `unavailable`). Optional resolved package and module facts, observed artifact-instance counts, and kebab-case structured diagnostics are available through the canonical JSON/schema contract; human output presents the same status model and labels incomplete `unavailable` counts.

The implementation introduces a dedicated read-only artifact-provisioning Consumer Gateway. Its real adapter projects deterministic preparation facts without exposing or calling apply, acquisition, or project-file writes. Missing or malformed packages remain inventory rows, while repository or configuration failures that prevent a trustworthy declaration inventory fail the command. Missing `ns.toml` is a successful empty inventory, and a nonempty declaration list without harness selection remains inspectable with `unavailable` artifact status.

The two live references to retired `ns update --extensions` behavior were corrected: extension-authoring documentation now names lifecycle reconciliation through `ns init` and nested `ns extension` commands, and undeclared-target recovery now directs users to `ns extension install <source>`.

## Objective Impact

The first two roadmap rows are complete. Fake-driven operation tests, real adapter integration tests, and host CLI tests cover declaration cardinality/order, npm and local metadata, broken and duplicate declarations, all artifact statuses and precedence, aggregate counts, malformed configuration, help/schema/JSON behavior, local conflicts, and repeated-list byte idempotence. Package-focused checks/tests, `just ts-test-typescript-style-guard`, the bounded stale-reference grep, and the full `just` baseline pass.

The implementation confirms that existing descriptor, manifest, and preparation facts support the agreed v1 model without mutation. The important caveat for downstream release and onboarding verification is explicit: `unavailable` means numeric counts are observed facts and may be partial, not a completeness claim.

## Follow-Ups

- Record the completed contract and the `unavailable` count caveat in the `ship-objectives-to-customers` Umbrella Objective through a separately selected `objective-update` workflow.
- After that synthesis evidence exists, reassess this Subobjective's final roadmap row and Closure Gate.
- Parked expansion remains unchanged: fleet-wide update, user/global scope, bare npm-name sugar, additional remote source kinds, and self-update behavior are not part of this surface.
