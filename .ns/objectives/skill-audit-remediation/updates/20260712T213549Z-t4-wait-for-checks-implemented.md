# T4 wait-for-checks implemented

## Summary

Accepted T4 item 2 implemented via an Objective Runner step on
`skill-audit-t4-wait-for-checks` (commit ad908623). `ns address exec
wait-for-checks` now sits beside `branch-pr-checks` in the pr-feedback capability:
it polls the same batched checks gateway until settled and reports once —
`passing`/`failing`/`timeout`/`mapping-gap` — with failing short-circuiting
immediately, cancelled counted as failing, and pending-past-deadline as timeout
(exit 1). Polling runs through new Clock/TimerScheduler seams on PrAddressContext;
default-lane tests never really sleep (7 unit + 11 scenario cases on manual
clock/fakes). code-fix-gh-stack's step 9 sleep/re-query loop — the last agent-driven
polling loop in the code-ops family — is now a single CLI call, and step 2's
lower-PR-pending wait points at the same primitive.

Judgment calls flagged for review: the 15s interval / 900s timeout defaults are new
(the skill prescribed no numbers); gateway failures mid-wait fail fast with no retry,
matching the sibling; the deadline check can overshoot by up to one interval
(documented in core). Live verification covered help/schema/usage-error paths and
kernel registration; real-GitHub settle behavior is covered by the fake-backed lanes
(no PR exists and runner steps make no external writes).

Validation: `just` green (510 files / 5135 tests after additions; one
`ts-format-fix` pass), `areg check` OK, code-fix-gh-stack verified.

## Objective Impact

Tranche 4: three of five accepted items done (routing retrofit, backup-refs,
wait-for-checks). Remaining: handoff slug/term-matching, episode-slice script, then
the graduate records and the skill-management-subsystem note.

## Follow-Ups

- Knowing minor drift deferred: pr-address's `references/cli-reference.md` operation
  inventory does not list wait-for-checks (its text names no polling loop, so the
  slice's constraint left it untouched); a one-line addition can ride any later
  pr-address edit.
