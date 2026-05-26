# Standalone aretro Only

## Summary

The durable `aretro` command contract is now standalone-only. `aretro` should not remain mounted as a subgroup or plugin of the parent `asdl` CLI; skills should invoke `aretro exec collect-evidence` directly through the standalone executable.

This supersedes the earlier roadmap assumption that plugin discovery was part of the shipped `aretro` surface. The PR5 plugin-path coverage still served as contract evidence while that wiring existed, but the next implementation slice should remove the parent `asdl` plugin entry point/group wiring and update plugin smoke expectations accordingly.

## Objective Impact

The Objective scope, non-goals, completion criteria, and roadmap now describe `aretro` as a standalone CLI package with no parent `asdl` plugin registration. A new PR6 removal slice has been inserted before the branch-retrospective skill work; the skill and real-session validation slices move to PR7 and PR8.

This keeps the skill-facing boundary narrower: one direct command path, no duplicate `asdl aretro` surface, and no need for future skills to depend on parent CLI plugin discovery.

## Follow-Ups

- PR6 should remove the `aretro` plugin registration/group from the parent `asdl` CLI surface and adjust tests so plugin discovery does not expose `aretro`.
- PR7 should create or update the branch retrospective skill against the standalone `aretro exec collect-evidence` command.
- PR8 should validate the standalone steelthread against real branch sessions.
