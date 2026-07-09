# Trunk refresh: orientation "what you see now" corrected to trunk ground truth

## Summary

Verified rebaseline against trunk HEAD (a814ebe36). The objective landed via PR #3294
(now merged; PR #3291 also merged as the pure `hiddenExecGroup` SDK export). No commit has
touched `ts/packages/capabilities/flow` since the objective was created, so the record's
not-started roadmap is accurate: `flow.submit.pre` is still the gate id, there is no `ns
flow validate` command, no `flow.validation.pre-submit` / `flow.validation.recovery`
point, and `references/repo-specificity-audit.md` does not yet exist. `references/README-
draft.md` and `references/validation-gates-plan.md` are present; the promotion target
`ts/packages/capabilities/flow/README.md` correctly does not exist yet. `docs/guides/points.md`
and ADR 0031 (`docs/adr/0031-point-system.md`) both exist.

One durable correction: `orientation.md`'s "What you see now" line claimed a hardcoded
`code-just-fix` skill reference and stderr prose sniffing live in
`flow/src/pi/ns-extension.ts`. That file is a plain command-registration bridge with no
recovery logic (verified by full read and `git log -S code-just-fix`, which shows the
string never appeared there). `code-just-fix` occurs zero times in the flow package on
trunk. The only hardcoded `code-just-fix` auto-fix bridge on trunk is the generic pi
`/just` command (`.pi/extensions/just-fix.ts`), which is exit-code-driven (not stderr
prose sniffing) and separate from flow submit. The orientation line described the
pre-strip PR #3291 branch code that was reverted and never landed. Corrected the line to
point agents at the true trunk state.

## Objective Impact

No change to thesis, scope, non-goals, completion criteria, assumptions/risks, open
questions, or roadmap — all still match trunk. `objective.md`'s conceptual reference to
"the hardcoded `code-just-fix` Pi auto-fix bridge" remains accurate (the generic pi `/just`
bridge exists) and was left unchanged; only the orientation's file attribution was wrong.
Completion criteria are far from met (validation-gates, `ns flow validate`, recovery point,
audit, README promotion all outstanding), so the objective stays open.

Provenance: objective-refresh basis target=a814ebe365b9164fdcd31c3cf09c681be670c4f0 from=trunk-HEAD

## Follow-Ups

- When the recovery slice lands, re-derive `orientation.md`'s "What you see now" line again
  (or retire it) as the migration shrinks per the umbrella re-derivation rule.
