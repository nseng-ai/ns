# T4 episode-slice script implemented

## Summary

Accepted T4 item 4 implemented via an Objective Runner step on
`skill-audit-t4-episode-slice` (commit eeeb50c9). context-bundle-analysis now bundles
`scripts/slice-episode.mjs` — a stdlib-only, read-only Node script with `--list`,
`--episode <label|N>`, `--turns <start>:<end>`, and hard per-turn/total output caps
that report truncation explicitly with a resume hint. SKILL.md's Reading procedure
routes all transcript excerpts through the script (192 → 208 lines), eliminating the
audit-flagged hand-rolled offset/limit reads that risked the skill's own
read-too-much rule. No new ns CLI surface was created, honoring the binding frontload
decision (the input is a bundle file, not repo state).

The script was verified live against a synthesized 8-turn bundle fixture covering
episode listing, label/index resolution, per-turn and total-cap truncation, direct
messages.jsonl input, and all error paths. Session note: this step's dispatch was
interrupted once mid-run (harness-level), leaving the branch and a draft script; the
re-dispatched child verified and finished the draft rather than recreating it, and
all runner gates (head-unchanged, branch-matches-report) passed.

Validation: `just` green, `areg check` OK, `areg skill show context-bundle-analysis`
healthy.

## Objective Impact

All five accepted T4 implementations are done: routing retrofit, backup-refs,
wait-for-checks, handoff slug/match, episode-slice. The T4 row's remaining work is
the graduate records (`ns cmux exec` inventory helper, objective exec surface
extension, `ns slot gt exec` restack-preflight + descendants-report) and the
areg-mutations note on skill-management-subsystem.

## Follow-Ups

- Final T4 slice: create the three graduate objective records with edges back to
  this Objective, and the areg-mutations note on skill-management-subsystem. Use the
  live `ns cmux exec` naming per the flow+ccc slice's correction.
