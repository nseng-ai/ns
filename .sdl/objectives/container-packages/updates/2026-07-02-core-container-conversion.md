# Core Container Conversion

## Summary

The approved `@sdl/core` conversion slice folded the five neutral-infra satellite packages into `@sdl/core` as declared subpackages: `exec`, `cli-runtime`, `cli-theme`, `test-kit`, and `typescript-analysis`. The existing `time` unit remains declared, and the loose core source is now claimed by the pinned `primitives`, `terminal`, and `config` units.

## Objective Impact

This advances the first approved package conversion row and reduces the top-level workspace package count by exactly five. Consumers now import the folded surfaces through curated `@sdl/core/<subpackage>` exports, and `@sdl/core` is properly formed with no remainder declaration.

Topology evidence: package count 44 → 39, topology circles 45 → 48; the folded package ids disappeared as top-level circles and reappeared under `@sdl/core/*`. Validation passed with the core package tests plus the required style/format/type/dprint gates, full default TS tests, integration tests, lint, and dependency checks.

## Follow-Ups

- Continue with the next approved conversion row, `@sdl/kernel` → container.
- Historical Objective records may still mention the former standalone package names as provenance; live workspace imports and manifests should use the new `@sdl/core/<subpackage>` surfaces.
