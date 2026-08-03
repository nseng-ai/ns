# Objective Update: Package-Atomic Admission and Durable User Config

## Summary

Remediated the completed User lifecycle slice so command availability now means complete package admission rather than descriptor loading. ADR 0054 records whole-package precedence and collisions, descriptor-level requirements, cycle-aware dependency admission, and the machine-wide User availability projection.

## Evidence

- `ts/packages/public/sdk/src/extensions/package-admission.ts` plans deterministic all-or-nothing package admission, including Built-in reservation, intrinsic and same-level conflicts, whole-package cross-level precedence, commandless providers, and requirement cascades/cycles.
- `ts/packages/public/sdk/src/extensions/registry.ts` preserves package grouping until final admission and derives effective command candidates and package-name presence only from admitted contributions.
- `ts/packages/public/sdk/src/extensions/user-package-availability.ts` exposes the SDK-owned Built-in + Preinstalled + User projection used by lifecycle code; Project declarations are intentionally absent.
- `ts/packages/public/ns/src/init/install-extension.ts`, `list-extensions.ts`, and `update-extension.ts` prospectively reject unavailable installs without config mutation, retain rejected declarations as binary unavailable rows, and fail unavailable updates without writes. Uninstall remains descriptor/admission independent.
- `ts/packages/public/ns/src/init/real-user-extension-config.ts` rejects symlinks and replaces config through an exclusive sibling temp, complete write, file sync, final best-effort destination recheck, rename, and parent-directory sync while preserving the existing mode.
- Focused SDK planner/registry/availability tests and ns lifecycle/durable-writer tests cover package-wide rejection, dependency behavior, no-write failures, operation order, cleanup, mode preservation, and symlink rejection.

## Objective Impact

The completed discovery and User lifecycle rows now describe package-atomic admission and crash-safe replacement.

## Follow-Ups

User-scoped npm acquisition, cross-repository proof for the intended extension set, and final user documentation remain open.
