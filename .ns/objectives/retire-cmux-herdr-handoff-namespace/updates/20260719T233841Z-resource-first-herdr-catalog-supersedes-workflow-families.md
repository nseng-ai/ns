# Resource-First Herdr Catalog Supersedes Workflow Families

## Summary

The interim decision to organize public Herdr Pi commands under generic `handoff` and `objective` workflow-family namespaces is superseded. The settled catalog is resource-first: the third segment always identifies the Herdr destination resource (`space` or `tab`), and action names describe the workflow performed on that destination.

The exact target catalog is `/ns:herdr:space:{new,goal,objective-summary,dispatch-prompt,dispatch-trunk-prompt,dispatch-plan,dispatch-trunk-plan}` and `/ns:herdr:tab:{new,goal,dispatch-plan,handoff}`. This is a hard migration with no aliases. `handoff` appears only on `tab:handoff`, where the workflow creates and verifies a durable Handoff Artifact; the hidden portable `ns herdr exec handoff-tab launch` mechanism remains unchanged.

## Objective Impact

The previously completed namespace migration remains immutable historical evidence, but its generic workflow-family product decision no longer describes the destination. The Objective now tracks three additional implementation outcomes: explicit `tab:new` and `tab:goal` resource operations, refreshed-trunk Saved Plan dispatch through `space:dispatch-trunk-plan`, and reconciliation of live command/documentation surfaces to the exact eleven-command catalog.

The refreshed-trunk workflow must reuse shared Graphite trunk preparation and Branch Context collision/race policy. Its branch tip and Graphite parent must both derive from the exact refreshed trunk, and dry-run must remain non-mutating while reporting truthful preparation and launch evidence.

## Follow-Ups

- Implement the exact catalog and prove all interim aliases absent from live registration.
- Add explicit caller workspace/tab validation and tab rename support before tab resource mutations.
- Deepen Capability Kit and Branch Context seams for truthful trunk preparation, explicit start point, and explicit Graphite parent.
- Reconcile current documentation while preserving historical records and leaving gated `docs-site/` unchanged.
- Treat any current Objective-check incompatibility in the immutable legacy update as a reported structural blocker rather than rewriting history.
