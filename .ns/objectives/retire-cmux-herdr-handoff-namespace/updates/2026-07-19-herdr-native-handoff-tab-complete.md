# Herdr-native Handoff Tab Complete

## Summary

The destination-specific Handoff tab workflow now belongs to the Herdr Pi extension as `/ns:herdr:handoff:tab`, with the model-facing launch tool hard-renamed to `herdr_handoff_tab_launch`. The old `/ns:cmux:handoff-tab` command and `handoff_tab_launch` tool no longer register, and no compatibility aliases remain.

Handoffs now exposes one curated optional Pi integration subpath for artifact creation, content-derived slugging, saved-artifact verification, and pickup-command construction. Herdr declares that integration as an optional peer, registers the workflow only when the module resolves, and propagates installed-module initialization or transitive dependency failures instead of treating them as absence.

The command requires a trimmed `HERDR_WORKSPACE_ID` before prompt delivery. Its prompt carries that captured workspace explicitly into validated tool parameters; after Handoffs verifies the saved artifact, Herdr creates a focused tab labeled `handoff: <slug>` in that exact workspace and runs the pickup Pi in the returned root pane. Pane-launch failures retain tab/pane identity and a manual recovery command.

## Objective Impact

The roadmap row **“Replace cmux handoff-tab with a Herdr-native workflow”** is complete. Fake-driven coverage proves exact and conditional registration, idempotent shared slug-tool registration, preflight-before-prompt ordering, invalid-parameter rejection before verification or destination effects, missing-artifact and verification-failure behavior, verification before Herdr mutation, focused exact-workspace launch, model/provider/thinking preservation, and recoverable create-tab/pane-run failures.

Validation passed through the Handoffs and Herdr package suites/checks, the affected areg coverage, dependency and stale-surface audits, and the full repository `just` entrypoint. Installed Herdr CLI help also confirmed explicit-workspace focused tab creation and pane command launch remain supported.

The package-boundary risk is de-risked for this slice: Handoffs has no dependency on Herdr, Herdr imports only the curated optional Handoffs subpath, and no generic multiplexer abstraction was introduced.

## Follow-Ups

- Remove standalone Herdr `space:open-branch` and the remaining cmux capability in the next roadmap slice.
- Reconcile broad live topology and documentation in its dedicated later row; current `docs/pi/README.md` cmux references remain intentionally deferred, while ADR and ontology-reshape references remain historical evidence.
- Design and disposition `/ns:herdr:handoff:trunk-plan` before closing the Objective.
