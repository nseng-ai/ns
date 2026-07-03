# code-resolve-merge-conflicts surgical pass (queue position 8)

## Summary

Surgical remediation of `skills/code-resolve-merge-conflicts/SKILL.md` — queue
position 8. The re-rank recorded this target's debt as **assumed rather than
verified** (223 lines, not re-read at re-rank time); the surgical pass began with
the full line-by-line read and found the engine largely clean — cross-references
are used properly (step 4 → step 3c marker sweep, step 7 → step 2, Driver
contract single-homed).

One real duplication collapsed (223 → 221 lines): the escalation payload trio
(both sides of the conflict region / the intent-diff / a proposed resolution with
reasoning) was enumerated separately in both channel subsections of step 5. It is
now defined once as "The escalation payload, for either channel", with the `user`
channel presenting it and the `return-to-parent` channel returning it plus its
three driver-specific fields (affected file, why outside the safe set, `git
status` state). Field set alignment with the driver skill's output contract
verified. No safety rule, safe category, verification gate, or abort-policy
wording changed — the method cap (risk of silently softening a safety rule) was
honored.

## Objective Impact

- Queue position 8 complete via the surgical method: verified-clean finding plus
  one minimal collapse, satisfying the remediate-or-record-clean bar.
- `roadmap.md`: the elevation-candidates row records the DONE disposition.
- Evidence: `areg check` "All skills OK"; `dprint` clean.

## Follow-Ups

- Queue position 9 (`objective-close`, near-zero tail) next.
