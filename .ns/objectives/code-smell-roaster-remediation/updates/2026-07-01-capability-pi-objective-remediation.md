# Capability Pi Objective Remediation

## Summary

Remediated the `ts/packages/capability-pi/objective` sub-slice from `references/capability-pi.md`:

- Removed objective-pi's `selection.ts` and `picker.ts` pass-through middle-man modules, with `extension.ts` and `index.ts` now importing/re-exporting the canonical Objective API directly.
- Centralized duplicated objective command error notification in `notifyCommandError`.
- Introduced `ObjectiveInvocationContext` so the Pi host, command context, and Objective command spec travel together through objective invocation helpers.

A package-local runtime test imported the deleted `selection.ts` middle-man, so its import was retargeted to the canonical `@sdl/objective/api` source while preserving the same behavior coverage.

Validation passed: `pnpm --dir ts --filter @sdl/objective-pi run check`, `pnpm --dir ts --filter @sdl/objective-pi run test`, `just ts-format-check`, `just ts-lint`, and `just ts-check`.

## Objective Impact

The capability-pi cluster now has the objective-pi findings dispositioned as fixed. The `capability-pi` roadmap row remains in progress because the handoff sub-slice is still open.

## Follow-Ups

- Continue the `capability-pi` cluster with the remaining `ts/packages/capability-pi/handoff` findings.
