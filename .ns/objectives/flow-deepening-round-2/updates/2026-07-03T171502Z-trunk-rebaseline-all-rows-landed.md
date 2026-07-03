# Trunk rebaseline — every Work row confirmed landed on master; only the Parked closure gate remains

## Summary

An `objective-refresh` pass verified this record against trunk
(`master` @ `5668ac5630b2bab397ef85b9e4cfe4d5cd84c420`, clean worktree).

Provenance: objective-refresh basis target=5668ac5630b2bab397ef85b9e4cfe4d5cd84c420 from=trunk-HEAD

Findings, all forensically probed on trunk:

- **Every Work row's branch stack merged to `master` as squash commits.**
  The record previously ended at "the branch stack ends at
  `flow-r2-round-trip-retirement`; submission stays outside runner scope" —
  that is superseded. Squash SHAs: round-1 rows `610948b05` (all three);
  channel operation-shaping `73d5fbf7d`; `--force` `fcb81f440`; shims +
  inventory `87cc17915`; submit/catalog `edb279176`; migration slices 1–9
  `733a84fca`, `be3e07b2a`, `04cf9784e`, `384853388`, `20d88c5c7`,
  `c473cfd5b`, `8d7da8d44`, `444ec89f9`, `d7e142477`; round-trip retirement
  `dd09a496a`. The original branch commits cited in rows are not ancestors of
  `master` (squash merges); they remain as delivery provenance.
- **Structural completion criteria re-verified on current trunk**: zero
  `runRaw`, `LandPlanForFlow`, `preloadedShape`, `flow-adapter-failure`, and
  `plan-mapping` references in flow/ccc; `plan-mapping.ts`,
  `graphite-metadata-command.ts`, and the five forwarder shims absent; the
  four-gateway `LandContext` in `src/land/types.ts` carries every
  slice-added method; `submit-detect.ts` imported only by the gateway
  implementation and its own test; `--force` wiring and its scenario test
  present; land scenario tests still script `pi.exec` (`ScriptedExec`).
- **Repo-wide renames landed after this record's updates** (owned by
  `rename-sdl-to-ji` / package restructuring, not this Objective):
  `sdl-flow` → `@ji/flow` (api export now `@ji/flow/api`; Land Domain Core
  exported as `@ji/flow/land/api` + `/land/testing`); CLI `sdl flow` →
  `ji flow`; `src/land-stack/` → `src/land/stack/`; commands under
  `src/ji/commands/`; `shared/failure-catalog.ts` →
  `src/phase-stream/failure-catalog.ts`; `shared/text-generation.ts` →
  `src/submit/text-generation.ts`. A new, unrelated
  `land/stack/command-exec.ts` helper exists (imports from the channel) — not
  a resurrection of the collapsed wrapper cluster.
- **Parked row premise refreshed**: the three presentation files exist at
  `src/land/stack/` (514/132/250 lines vs the recorded 519/132/250), but
  trunk has since further refactored land confirmation and maintenance
  control flow — a fresh inventory is mandatory at promotion.
- **No ownership overlap**: `flow-capability-layer-cleanup` is closed; this
  is the only open flow Objective.

## Objective Impact

`objective.md`, `roadmap.md`, and `orientation.md` were rewritten/re-derived
to state trunk reality: all six work streams delivered and merged; criteria
marked as holding with current path names; execution policy marked spent;
extraction blast-radius and compatibility-drift risks retired; the remaining
live risk is Parked-row premise decay. The Objective is closure-ready pending
the closure gate: an owner promote/re-scope/drop decision on the Parked
presentation row (review #5), plus full `just` validation at close time.
This refresh does not close the record.

## Follow-Ups

- Owner decision on the Parked row (promote / re-scope / drop with
  rationale), then `objective-close` semantics via the normal lifecycle
  skills.
