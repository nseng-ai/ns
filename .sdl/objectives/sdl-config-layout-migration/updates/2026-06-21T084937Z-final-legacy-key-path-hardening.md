# Final legacy key/path hardening

## Summary

PR #1969 (`branch-context-plan-md-slots-worktree-fix`) fixed the two final readiness blockers found after the main legacy-layout cleanup branch was otherwise green:

- Branch-context existing-branch reuse now validates session-provided attached-plan keys through the supported-key selector before checking Branch Memory attachment presence, so stale session evidence with `key: "plan.md"` cannot make a legacy attached plan reusable.
- CCC land-stack managed-slot detection now recognizes only canonical `.../sdl/slots/repos/<repo>/worktrees/slot-*` paths; legacy `.slots/repos/.../worktrees/slot-*` checkouts are classified as ordinary manual worktree conflicts.

The slice added direct regression coverage in `ts/packages/branch-context/test/existing-branch-reuse.test.ts` and `ts/packages/ccc/test/land-stack.test.ts`, while updating existing land-stack managed-slot scenarios to use canonical XDG slot paths.

## Objective Impact

This completes the active cleanup contract recorded by the Objective: branch-context attached plans use supported named Markdown keys rather than legacy `plan.md`, and SDL-managed slot behavior is tied to the canonical XDG-backed `sdl/slots` layout rather than the legacy `.slots` pool. The remaining legacy mentions in the touched surfaces are negative tests or explicit manual-conflict assertions, not active compatibility behavior.

Validation evidence for the branch slice:

- Focused Vitest command passed for branch-context reuse, attached-plan, Pi branch-context session, and CCC land-stack tests: 4 files / 129 tests.
- Full `just` passed, including dprint, dependency checks, TypeScript formatting/linting, tsgo, Vitest, and guard checks: 296 files / 3003 tests.
- Targeted stale-term sweep showed `.slots` only in negative/manual-conflict assertions and `plan.md` only in unsupported-key tests, generic plan-file fixtures, or existing ambiguity coverage.

## Follow-Ups

- No additional semantic cleanup work remains in this Objective after PR #1969 lands on top of the earlier cleanup branch.
- Ordinary merge/CI monitoring and any user-local migration choices remain outside the Objective roadmap; no automatic migration or deletion of old local data was introduced.
