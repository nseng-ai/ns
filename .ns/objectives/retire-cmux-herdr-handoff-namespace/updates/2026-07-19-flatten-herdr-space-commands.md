# Flatten Herdr-Native Space Commands

## Summary

The Herdr command reorganization now renames `/ns:herdr:space:new` to `/ns:herdr:space-new` and `/ns:herdr:space:goal` to `/ns:herdr:space-goal`. Their behavior remains unchanged.

## Objective Impact

`space` is not a cross-package mixin like `handoff` or `objective`; these operations install with and are owned entirely by the Herdr capability. The Objective scope, completion criteria, and namespace roadmap now require flat Herdr-native names rather than a `space` sub-namespace. No compatibility aliases are planned.

## Follow-Ups

- Update command constants, registration, usage/status copy, tests, Herdr context, and live command inventories during the namespace-reorganization slice.
- Include both retired `space:*` names in the final stale-live-surface audit while preserving accurate historical records.
