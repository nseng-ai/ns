# Extension List Contract Synthesized

## Summary

The complete v1 `ns extension` acquisition surface has landed. `ns extension list` emits one deterministic inventory row per declared top-level `ns.toml` extension source. It keeps acquisition states (`installed`, `missing`, and `invalid`) distinct from artifact states (`none`, `provisioned`, `needs-reconcile`, `conflicted`, and `unavailable`), while canonical JSON/schema output carries resolved facts and structured diagnostics.

Listing is read-only: it does not acquire, apply, reconcile, or rewrite project state. When artifact state is `unavailable`, its numeric counts are observed facts that may be incomplete rather than a comprehensive inventory.

## Objective Impact

The umbrella acquisition-verbs roadmap row is complete. Install, uninstall, and single-target update retain their previously recorded lifecycle evidence; list adds the deterministic inspection contract needed to explain the complete v1 surface. Downstream bare-core release and Claude Code onboarding checks must preserve the distinction between acquisition and artifact status and must not interpret `unavailable` counts as complete.

The umbrella remains open for the bare-core publication, publishable documentation, and customer onboarding work. Its current lack of a Blocked Sentence remains accurate because useful parent and downstream work can continue.

## Follow-Ups

- Close `objectives-extension-customer-surface` after linking its final synthesis row to this update.
- Exercise the complete surface in the bare-core release and Claude Code onboarding Objectives without broadening the parked v1 acquisition scope.
