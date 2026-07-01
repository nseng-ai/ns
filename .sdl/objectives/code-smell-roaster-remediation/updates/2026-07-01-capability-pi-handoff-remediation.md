# Capability-Pi Handoff Remediation

## Summary

Remediated the remaining `ts/packages/capability-pi/handoff` sub-slice from `references/capability-pi.md`:

- `pickup-list.ts` now shares `--branch <branch>` and `--branch=<branch>` parsing through `consumeBranchFlag`, while pickup and list retain their separate help, selector, `--all`, unknown-flag, and mutual-exclusion behavior.
- Handoff's former `shared.ts` junk drawer was split into focused modules for command constants, fallback prompt copy, create-focus prompting, handoff-create skill loading, current-branch resolution, handoff existence checks, Markdown fencing, command-failure formatting, and UI status/start-message formatting. `shared.ts` remains only as a compatibility re-export surface for existing test/public imports.
- `tab-launch.ts` now uses the canonical `HandoffLaunchParams` from `launch-flow.ts` instead of maintaining a duplicate `HandoffTabLaunchParams` field clump.

Validation passed on 2026-07-01:

- `pnpm --dir ts --filter @sdl/handoff-pi run check`
- `pnpm --dir ts --filter @sdl/handoff-pi run test`
- `just ts-format-check`
- `just ts-lint`
- `just ts-check`
- `just dprint-check`

## Objective Impact

The `capability-pi` roadmap row now has fixed dispositions for all 13 recorded findings across branch-context, ccc, flow, handoff, and objective, so the row is marked complete. This reduces the open code-smell-roaster backlog by one partially completed cluster without changing observable Pi handoff command or tool behavior.

## Follow-Ups

No capability-pi follow-up is known. Continue the Objective with another open cluster such as `tools`, `hosts`, `infra`, `capabilities`, or `local-pi-tools`, checking overlap notes before implementation.
