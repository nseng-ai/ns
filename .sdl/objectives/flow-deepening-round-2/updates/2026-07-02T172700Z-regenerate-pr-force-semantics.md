# `regenerate-pr --force` has full force semantics

## Summary

The `--force` row landed via an autorun runner step (commit `bbdd2b5f7` on
`flow-regenerate-pr-force-semantics`, stacked on the channel step; provenance
trailer `Objective-Runner-Step: flow-deepening-round-2`). `--force`/`-f` now
wires `fingerprintPolicy: "force"` into `preparePrDescriptionUpdate` and
suppresses the confirmation step, matching land's `--force`. The
"compatibility no-op" doc sentence and the no-op notice branch are deleted;
the flag description and command help state the real semantics. The diff is
two files: `src/commands/regenerate-pr.ts` and its scenario test.

Precondition finding worth keeping: the row pointed at the closed
`clinkr-confirmation-danger-tiers` Objective record, but no
`.sdl/objective-archive/` directory exists in this checkout — the durable
home of those conventions is ADR 0014
(`docs/adr/0014-clinkr-confirmation-danger-tiers.md`). The ADR standardizes
`--force`/`-f` as the non-interactive authorization that relaxes
confirmation, so the bypass follows the convention rather than fighting it.

Evidence: scenario tests cover forced regeneration of a fingerprint-current
body without prompting, default no-op on current, and default prompt on
stale. The step reported the full Definition of Progress suite green; the
parent independently re-ran the flow package suite (47 files / 419 tests,
pass) and `just ts-check` (pass).

## Objective Impact

- The regenerate completion criterion now holds in code and tests; the
  `--force` confirmation-bypass risk resolved in favor of the row's premise,
  backed by ADR 0014 rather than judgment.
- Three of six work streams remain: forwarder shims, the land extraction
  (inventory → migration → round-trip retirement), and the submit/catalog
  de-leak.

## Follow-Ups

- Objective prose still cites the "closed `clinkr-confirmation-danger-tiers`
  Objective record" as if readable; future rows should cite ADR 0014
  directly.
