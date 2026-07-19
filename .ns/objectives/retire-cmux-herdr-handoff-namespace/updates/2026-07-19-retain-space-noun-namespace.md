# Retain the Space Noun Namespace

## Summary

The earlier decision to flatten `/ns:herdr:space:new` and `/ns:herdr:space:goal` is superseded. Both commands remain unchanged under the `space` namespace.

## Objective Impact

The command model now treats the third namespace segment as an organizing noun. Under this model, `handoff`, `objective`, `space`, and `tab` are valid noun namespaces beneath `ns:herdr`. The Objective and roadmap no longer require `space-new` or `space-goal` names.

The earlier `2026-07-19-flatten-herdr-space-commands.md` update remains immutable historical evidence of the superseded decision.

## Follow-Ups

- Preserve `/ns:herdr:space:{new,goal}` during implementation.
- Apply the noun-namespace model when reviewing the remaining Herdr command catalog.
