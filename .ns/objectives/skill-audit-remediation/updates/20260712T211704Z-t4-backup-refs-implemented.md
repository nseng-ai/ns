# T4 backup-refs implemented

## Summary

Accepted T4 item 1 implemented via an Objective Runner step on
`skill-audit-t4-backup-refs` (commit e0a9ce31). `ns slot gt exec backup-refs` now
single-sources the backup-ref recipe previously duplicated in code-smush and
code-gt-linearize-descendants: required `--label`, repeatable `--branch`, standard
envelope/`--format json`/`--json-schema`, refs created as
`backup/<label>-<stamp>/<safe-branch-name>` matching the skills' existing scheme
(pre-existing `backup/smush-*` refs in the repo confirmed it), with one drift from
the replaced recipe: stamps are UTC where the old `date +%Y%m%d%H%M%S` used local
time — cosmetic since refs are stamped, never parsed. Implementation is pure
git via the existing SlotRepositoryGateway — no Graphite dependency — and sits under
the sanctioned `slot gt` group. Wall-clock stamps go through a new required
`clock: Clock` seam on SlotCliContext (systemClock real, manual clock in tests); all
construction sites were updated. Both consumer skills now instruct the exec command
with stop-on-failure guidance; smush's restore prose was correctly left alone (it is
restore guidance, not the duplicated creation recipe).

Tests: a pure-logic unit file (stamp formatting, slash encoding, plan building) and 8
scenario cases (help, envelopes, usage errors, branch-not-found, backup-ref-exists
with no mutations, partial-failure data, dedupe). Live verification created and
deleted a real backup ref and exercised the error path.

Validation: `just` green (508 files / 5116 tests after the additions; one
`ts-format-fix` pass on the new TS files), `areg check` OK, both skills verified.

## Objective Impact

Tranche 4: two of five accepted items done (routing retrofit, backup-refs). The
SlotCliContext `clock` field is a small runtime API change confined to the slots
package — flagged for PR review. Remaining: wait-for-checks, handoff
slug/term-matching, episode-slice script, graduate records, and the
skill-management-subsystem note.

## Follow-Ups

- Next T4 slices: `wait-for-checks` primitive beside `ns address exec
  branch-pr-checks`; handoff create/pickup push-downs; context-bundle-analysis
  episode-slice script; then the graduate records and areg-mutations note.
