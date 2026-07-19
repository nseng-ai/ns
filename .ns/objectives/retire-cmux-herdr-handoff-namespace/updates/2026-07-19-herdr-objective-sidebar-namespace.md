# Namespace Herdr Objective Sidebar Behavior under the Objective Mixin

## Summary

The Herdr command reorganization now includes the breaking rename `/ns:herdr:sidebar:objective-summary` → `/ns:herdr:objective:sidebar-summary`. The command keeps its current Objective selection and caller-workspace label behavior; only its public namespace changes.

## Objective Impact

The Objective scope, completion criteria, and first roadmap row now require the Objective-owned Herdr workflow to sit under the `objective` mixin, parallel to the `handoff` mixin used for dispatch workflows. No compatibility alias is planned because ns is private and unreleased.

## Follow-Ups

- Update the Herdr command catalog, registration, tests, context, and live command inventories during the namespace-reorganization slice.
- Include the retired command name in the final stale-live-surface audit while preserving accurate historical records.
