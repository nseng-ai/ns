# PR 6 Standalone Only Complete

## Summary

PR 6 removes `aretro` from the parent `asdl` CLI plugin surface while preserving the standalone `aretro exec collect-evidence` command. The `aretro` package no longer publishes an `asdl.plugins` entry point, the root `asdl-tools[plugins]` extra no longer installs `aretro` as a parent CLI plugin, and the old `aretro.plugin` module/group wiring has been removed.

Standalone construction now stays inside `aretro.main` by building the same `aretro` group with its normal context factory. Plugin smoke coverage was updated so the parent plugin scenario asserts that a stale `aretro.plugin:build_aretro_plugin` entry point does not mount an `aretro` command, while standalone `aretro` scenario coverage continues to validate hidden `exec`, JSON contract, and missing-session-root behavior.

Verification passed with focused aretro/plugin tests, top-level CLI scenario tests, installed entry-point inspection showing no `aretro` entry in `asdl.plugins`, and the full `just` suite.

## Objective Impact

This completes roadmap PR 6 and makes the durable command surface standalone-only. Future branch-retrospective skill work should invoke `aretro exec collect-evidence` directly rather than relying on `asdl aretro` or parent CLI plugin discovery.

The implementation keeps the deterministic collection and privacy boundaries intact: no Graphite stack metadata, raw transcript output, LLM calls, or semantic recommendation logic were introduced.

## Follow-Ups

- PR 7 should create or update the branch retrospective skill against the standalone `aretro exec collect-evidence` command.
- PR 8 should validate the standalone steelthread against real branch sessions, including payload size, warning clarity, thresholds, and association confidence.
