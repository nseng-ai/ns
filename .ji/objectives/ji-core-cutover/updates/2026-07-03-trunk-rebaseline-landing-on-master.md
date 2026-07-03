# Trunk rebaseline: landing squash-merged to master; record is closure-ready

## Summary

Trunk-mode refresh of this record against master `5668ac563`. Decisive finding: the
entire landing window (B1 mv bracket + engine content edits + fix rounds +
parity-table update + landing evidence) reached master as the single Graphite squash
commit `d6184e4c4` ("[cutover B1] Caller brackets…", 2212 files changed). The
branch-local SHAs quoted in landing-time notes — `ff190fa70` (mv bracket),
`fa9f55601` (waiver ruling), and the engine-window commit — are not reachable from
master and are superseded by that squash; the waiver itself is independently recorded
in `cutover/cutover-runbook.md` §C.

Live verification against master: `"ji"` bin key and kernel manifest key, `.ji/`
state root, `ji.toml` present / `sdl.toml` gone, `.pi/extensions/ji.ts` present /
`sdl.ts` gone, zero `/sdl:` rows in the `cross-harness-parity` table (rows 38 and 51
carry `/ji:flow:submit` / `ji flow submit`), parent inventory carries the two
landing-discovered machine-migration items, parent core-cutover row is `[~]`, and
`ji --help` / `ji objective list` / `ji objective exec load-orientations` all work.

Record corrections in this refresh: thesis/scope rebaselined to landed-state framing;
stale pre-cutover paths corrected (`.sdl/objectives/…` → `.ji/objectives/…`;
`docs/platform-and-consumer.md` → `docs/conventions/platform-and-consumer.md`);
unreachable branch SHAs replaced with the master squash reference; assumptions/risks
rewritten as landed dispositions.

New finding (parent-owned): the accepted in-flight-branch straggler risk has
materialized once post-landing — `.sdl/objectives/objective-edges/` is tracked on
master (9 files) with no `.ji/objectives/objective-edges/` counterpart, making that
record invisible to `ji objective list`. Reported, not fixed here (outside this
Objective's boundary). Separately, a prepared-but-unmerged local branch
`close-ji-core-cutover` records this Objective's closure; this refresh does not close.

Provenance: objective-refresh basis target=5668ac5630b2bab397ef85b9e4cfe4d5cd84c420 from=trunk-HEAD

## Objective Impact

All roadmap rows remain `[x]` and every completion criterion except the
close-time parent-row handback is verified live on trunk: the Objective is
closure-ready. No scope change; the only durable narrative change is the shift to
landed-state framing plus the squash-commit evidence correction.

## Follow-Ups

- Close via `objective-close` (a local `close-ji-core-cutover` branch already drafts
  this) and complete the parent `rename-sdl-to-ji` cutover row with evidence at close.
- Parent-owned straggler: migrate `.sdl/objectives/objective-edges/` to
  `.ji/objectives/objective-edges/` so the record re-enters `ji objective list`
  discovery.
