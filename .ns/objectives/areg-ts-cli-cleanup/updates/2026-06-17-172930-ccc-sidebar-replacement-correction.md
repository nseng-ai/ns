# CCC Sidebar Replacement Surface Corrected

## Summary

A follow-up full-suite run exposed drift in the per-surface replacement inventory for the command-backed `ccc-sidebar` skill. The backing skill command mirror still derived `ccc-sidebar` to the retired `ccc:sidebar:session-summary` surface, while the areg-visible inventory and live Pi replacement path use `ccc:sidebar:pr-summary`.

The correction keeps `ts/packages/areg/src/operations/pi-replacement.ts` and `ts/packages/pi-extensions/src/backing-skill-commands.ts` in sync by routing `ccc-sidebar` to `ccc:sidebar:pr-summary`. PR #1729 corroborates the same correction on the current branch, and full `just` passed after the fix.

## Objective Impact

This does not reopen Batch 2 finding D; it reinforces the completed per-surface replacement contract by recording a concrete mirror-drift repair caught by the real-gateway parity test. The roadmap's Batch 2 replacement evidence now notes the follow-up correction and validation.

The remaining active Objective work is still Batch 5: shim rendering safety (G) and the version source-of-truth cleanup or explicit deferral (K).

## Follow-Ups

- Continue with Batch 5.
- Keep the areg-visible replacement inventory and backing skill command mirror synchronized when Pi command surfaces are renamed.
