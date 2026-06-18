# Initial Salvaged-Core Scope Recorded

## Summary

This branch introduces the `pr-address-ts-hardening` Objective as a durable follow-up to the advisory audit of `ts/packages/pr-address`. The Objective deliberately narrows the audit output to four fixes in the salvaged `core/` zone: the `gh api -F`/`@` local file-read primitive, silent comment loss on unparseable IDs, `read-feedback-detail --payload-path` containment, and removal of re-export/dead-export tech debt.

Provenance: objective-branch-refresh basis tip=00e82595ddc3975b307e6523baf3df321c9126fc from=ef9cc9aa61b46aedf07c90d8032f8e61cde9838e

## Objective Impact

The Objective now has an immutable creation/update breadcrumb tying the initial scope to the branch that adds `objective.md` and `roadmap.md`. No implementation rows are marked complete yet; the roadmap remains ready for the first hardening slice.

## Follow-Ups

- Resolve the open `read-feedback-detail --payload-path` containment question before implementing that row.
- Coordinate landing order with `pr-address-strangler-rewrite` because both branches can touch the same package surface.
