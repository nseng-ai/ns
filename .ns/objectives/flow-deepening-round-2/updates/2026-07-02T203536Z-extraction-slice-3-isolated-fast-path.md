# Extraction slice 3 landed — isolated fast-path merge via gateways

## Summary

Third autonomous slice of the extraction migration row (runner step,
commit `ee486b9f0` on `flow-map-slice3-isolated-fast-path-gateway`,
stacked on `flow-map-slice2-facts-backend`).

- `squashMergePullRequest` added to the Land GitHub PR gateway — the one
  gateway-interface addition the map names for this slice — backed by the
  existing `gh pr merge --squash` argv in `land-context-adapter.ts`.
- The isolated fast path (`land/isolated-fast-path.ts`) now merges through
  the gateway and, per the settled owner decision, gains the post-merge
  MERGED verification it previously skipped: after merge it reloads the PR
  (read-only `gh pr view`) and skips post-landing cleanup with an explicit
  failure message if the PR does not verify as MERGED. It remains a
  Flow-side shortcut; CONTEXT.md vocabulary unchanged.
- Parent-verified argv discipline: the merge mutation argv pin
  (`expectedMergeArgs` in `ccc/test/land-command.test.ts`) is unchanged —
  only its position index moved because a verification read now follows;
  all other ccc/flow assertion changes are the added read-only
  `gh pr view` steps, allowed under the relaxed fact-command gate.

Slice gate held: full Definition of Progress suite reported green by the
step; parent re-verified flow (47 files / 420 tests) and ccc
(11 files / 122 tests) suites plus `just ts-check`. `sdl-flow/api`
untouched.

Policy clarification recorded here: the owner's 2026-07-02 relaxed-gate
decision authorizes updating the ccc/flow scenario assertions that pin
fact-command streams whenever a migration slice's allowed fact-command
changes require it — the authorization is category-scoped (fact-command
assertion pins), not slice-2-specific. The Runner Policy wording now says
so.

## Objective Impact

- Slice 3 of 10 done, in map order. Next is slice 4 (backup refs onto
  `LandGitGateway` via `snapshotBackupRefs`; ref writes are mutations, so
  byte-for-byte argv applies).
- The isolated-fast-path open question is closed in code the way the
  owner decided: Flow shortcut, gateway-backed merge, MERGED verification
  added.
- `LandGithubPrFactsGateway` is no longer read-only; the inventory's
  "gateway gaps are concentrated in mutations" is now one gap smaller.

## Follow-Ups

- Continue the migration row at map slice 4.
