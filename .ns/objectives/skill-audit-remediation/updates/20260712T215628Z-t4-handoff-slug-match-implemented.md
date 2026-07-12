# T4 handoff slug normalization and pickup matching implemented

## Summary

Accepted T4 item 3 implemented via an Objective Runner step on
`skill-audit-t4-handoff-slug-match` (commit 9bbd6f71). `ns handoff create --slug`
now normalizes raw names itself (trim, one trailing `.md` dropped, lowercase,
non-alphanumeric runs to single dashes; empty → `invalid-handoff-slug`), reporting
`slug` plus `requestedSlug`. A new hidden `ns handoff exec match` implements
handoff-pickup's full selection ladder (exact key → normalized slug →
only-handoff-in-scope → all-terms word matching) through a core
`resolveHandoffSelection` extracted from the already-tested Pi pickup logic, so Pi
and the CLI share one implementation. Both skills now call the tested commands
instead of hand-executing the prose specs; the umbrella's lifecycle reference lists
the new command.

Compatibility was checked, not assumed: the full live inventory (71 handoffs,
including deleted) contains only already-normalized slugs, so the one-step
non-alphanumeric reading affects no stored handoff; term matching keeps the
pre-existing exact-token Pi behavior. Two deliberate behavior changes flagged for
review: `ns handoff create` previously rejected un-normalized slugs and now accepts
and normalizes them — the intended push-down, with an additive envelope change —
and the only-handoff-in-scope rung now applies only when the selector is empty
(the extracted Pi semantics), where the old skill prose auto-picked a lone handoff
even when supplied search words did not match it; the skill text states the
empty-selector condition.

Validation: `just` green (511 files / 5151 tests; one `ts-format-fix` pass),
`areg check` OK, all three handoff skills verified. Live verification included a
clearly-marked temporary handoff created, matched, and deleted via the sanctioned
delete path.

## Objective Impact

Tranche 4: four of five accepted items done. Remaining: the context-bundle-analysis
episode-slice script, then the graduate records and the skill-management-subsystem
note.

## Follow-Ups

- Final accepted T4 item: bundled episode-slice script for context-bundle-analysis.
