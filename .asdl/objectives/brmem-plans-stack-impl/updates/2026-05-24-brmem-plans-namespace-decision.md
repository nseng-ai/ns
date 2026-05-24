# Brmem Plans Namespace Decision

## Summary

The canonical storage contract for branch-stashed plans is now decided: write plan entries to Branch Memory namespace `brmem-plans` with key `<slug>.md` on the target implementation branch.

The intended write shape is:

```bash
brmem put <slug>.md --namespace brmem-plans --branch <target-branch> --file <temp-plan>
```

This separates branch-stashed implementation plans from both older namespace `plans` entries and older base `plans/<slug>.md` entries.

## Objective Impact

This resolves the primary storage-location branch point for the shared branch-from-plan-file core and the `create-brmem-plan-branch` command/tool contract. The implementation stack should now preflight and write namespace `brmem-plans` as the canonical target, and tests should assert that shape.

Compatibility remains an explicit follow-up decision: the stack still needs to decide whether readers such as `brmem-plan-impl` should read legacy base `plans/<slug>.md` and namespace `plans` entries, whether writers should create aliases, or whether old entries should be handled through documented manual migration only.

## Follow-Ups

- Update the shared branch-from-plan-file core design to preflight and write namespace `brmem-plans` with key `<slug>.md`.
- Decide whether compatibility reads should include legacy base `plans/<slug>.md` and namespace `plans` entries.
- Decide whether old `/create-brmem-plan` and `persist_brmem_plan` remain non-branching namespace `plans` flows or migrate to the new `brmem-plans` namespace.
