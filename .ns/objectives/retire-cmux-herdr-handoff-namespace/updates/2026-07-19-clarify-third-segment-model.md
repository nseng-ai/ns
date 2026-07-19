# Clarify the Third-Segment Command Model

## Summary

The third segment in `/ns:herdr:<segment>:<action>` is not required to be a noun. Native Herdr resources such as `space` and `tab` may organize commands by resource, while optional integrations such as `handoff` and `objective` may identify compositional workflow families.

## Objective Impact

This clarification supersedes the universal noun rule stated in `2026-07-19-retain-space-noun-namespace.md` while preserving that update's concrete decision to keep `/ns:herdr:space:{new,goal}`. The Objective and roadmap now distinguish native-resource namespaces from optional compositional namespaces without imposing one grammatical category on both.

## Follow-Ups

- Review each Herdr command by ownership and composition semantics rather than by a noun-only naming rule.
- Preserve the already settled `space`, `handoff`, and `objective` command mappings unless a separate product decision changes them.
