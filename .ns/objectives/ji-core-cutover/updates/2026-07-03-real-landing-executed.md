# Real landing executed: runbook §B ran green end-to-end on `ji-cutover/landing`

## Summary

The sdl→ji core cutover REAL landing (runbook §B1–§B5) is complete on branch
`ji-cutover/landing` (stacked on `update-objective-runner-drift` per the owner's
trunk-precondition waiver; same-day §A re-run waived, the 2026-07-02 post-drift
pass stood as the plan snapshot). B1's bracket commit (`ff190fa70`, 1773 mv-only
renames) was landed in the prior session; this window executed the three engine
chunks (~183 edit/verify agents, 0 failures), both fix rounds (budget exactly
consumed), the §B4 gate (dprint/oxfmt/oxlint/tsgo/vitest — **3994/3994 tests**,
matching the pre-mv baseline), and all four §B5 smoke tests (`ji --help`, old
shim gone, `ji objective list`, `ji objective exec load-orientations`). Both
scope-untouched baselines matched exactly (949 `@sdl/` files, 158 src-dir
survivor lines — zero over-renaming). Artifacts: `cutover/landing/*` (three chunk
reports, two fix-round reports, full skip triage, gate + smoke + invariant
evidence).

## What the real landing surfaced beyond the dry run

- **Five plan-gap brand machine literals** that every generator pattern missed
  and the dry run left silently: the `refs/sdl/flow-land-backup{,-prev}` git-ref
  namespace, the `<!-- sdl-pr-description:* -->` / `sdl-pr-description-v2` /
  `generated-by: sdl-dev` PR-body token family, the `sdl.pi-agent.v1` agent
  schema string (8 reader/writer files incl. checked-in `.ji/pi/agents/*.md`),
  the `# >>> sdl shell integration >>>` rc-file sentinel + message family, and a
  cs2/cs3 ownership race on `extension-manifest.test.ts`'s inline zod key. All
  renamed in fix round 1 per the standing "no sdl-brand literal survives"
  resolution and owner precedents (b)/(c); two carry machine-migration
  consequences, now recorded in the parent's `cutover-inventory.md` notes.
- **Chunk-3 verify earned its keep**: 8/22 invariant failures at verify, all
  real (fix-listed) or correctly survivor-judged; the judge-each rewrites from
  dry-run 1 produced zero of the old false-positive classes.
- **Interrupted-run resume worked**: chunk 1 was cut off mid-run by a session
  restart after ~10 file edits; `Workflow resumeFromRunId` replayed the journal
  and the re-run agents verified the pre-applied edits instead of double-editing.
- Gate mechanics repeated the dry-run script exactly: node_modules reinstall for
  the bin shims, one `dprint-fix`, one `ts-format-fix`, then green.

## State

`ji-cutover/landing` holds B1 (mv bracket) plus the engine-edit commit
(content renames + landing evidence). Remaining rename work (machine migration,
vocabulary/package-scope sweeps, repo rename) is the parent `rename-sdl-to-ji`'s;
its machine-migration checklist gained the rc-sentinel and backup-ref items.
