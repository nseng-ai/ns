# PR 7 Branch Retro Skill Complete

## Summary

PR 7 adds the public local `branch-retro` skill at `skills/branch-retro/`. The skill bundles `scripts/aretro-run`, installs through the local skill symlink chain, and invokes the standalone `aretro exec collect-evidence --format json` command rather than any parent `asdl` plugin surface.

The skill keeps deterministic collection and semantic interpretation separate: Python emits factual evidence, while the skill uses model judgment to write source-backed findings and recommendations. Its default mode is read-only and it asks before applying any follow-up recommendations.

Validation covered the skill runner and install links, `npx skills list`, a local smoke run of `branch-retro`'s runner against the current branch with `--max-sessions 2`, `git diff --check`, `just dprint-check`, and the full repository `just` suite.

## Objective Impact

This completes roadmap PR 7 and satisfies the completion criterion that a skill delegates deterministic collection to `aretro exec collect-evidence` while keeping recommendation writing in the skill/agent.

The command boundary remains standalone-only: future retrospective skill invocations should go through `aretro exec collect-evidence --format json` using the skill runner, not `asdl aretro` or parent plugin discovery.

## Follow-Ups

- PR 8 should validate the steelthread against real branch sessions, including payload size, thresholds, warning clarity, and association confidence.
- If real-session validation reveals skill guidance gaps, update `branch-retro` without moving semantic recommendation logic into Python.
