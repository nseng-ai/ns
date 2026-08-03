# Whole-extension source installation proved

## Summary

All eight intended general ns extension packages now have deterministic source-installation evidence: Branch Context, Flow, Handoffs, Herdr, Objectives, PR Feedback, Reviews, and Slots. Each package is tested independently with a fresh XDG user configuration and an unrelated non-Git invocation directory. The host lifecycle test installs exactly one canonical absolute package path at user scope, verifies the package is available through `extension list`, confirms activation is reported as `not-performed`, and compares a recursive before/after snapshot of the invocation directory.

The SDK integration matrix freezes every descriptor-derived leaf command path, including aliases, nested groups, and hidden `exec` commands, then lazy-loads every selected command module without executing handlers. Skill Exposure is absent from every isolated user catalog and declaration; a focused control proves its command surface appears at project scope only when explicitly declared by a project.

Source-shim regression tests render and execute the real Bash template with test-only fake `git` and `node` executables. They prove a caller ns checkout wins over the canonical checkout, an unrelated directory falls back to the canonical checkout, and arguments are forwarded unchanged. The public distribution boundary remains separate: the exact preinstalled catalog stays at the existing nine host-owned paths, the packed binary remains prebuilt rather than source-shim based, and the packed manifest is checked against runtime dependencies on all eight extensions plus Skill Exposure.

## Objective Impact

The roadmap row “Prove whole-extension source installation across repositories” is complete. The evidence covers independent user-scope lifecycle behavior, exact full command surfaces and module loading, no project activation artifacts, the project-local Skill Exposure boundary, source-shim checkout precedence, and public package isolation.

Validation evidence:

- Focused integration matrix: 2 files, 17 tests passed.
- Focused shim and preinstalled-catalog tests: 2 files, 5 tests passed.
- `pnpm --dir ts --filter @nseng-ai/ns run smoke:checkout-free` passed.
- `pnpm --dir ts --filter @nseng-ai/sdk test` passed: 26 files, 277 tests.
- `pnpm --dir ts --filter @nseng-ai/ns test` passed: 34 files, 324 tests.
- `just ts-test-integration` passed: 55 files, 260 tests.
- `just ts-test-typescript-style-guard` passed: 168 tests.
- `just ts-deps-check`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check` passed.
- `just ts-test` passed: 576 files, 6,070 tests.

## Follow-Ups

The final roadmap row remains open: reconcile user-facing extension documentation and configuration vocabulary. This slice does not pull that broad documentation work forward.
