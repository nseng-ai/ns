# End-to-End Local Journey and Success States Defined

## Summary

A grilling session resolved the first Question Row: the shape of the end-to-end
local pre-PR review-to-fix journey and its success states. Decisions, in journey
order:

1. **Unit of work**: an arbitrary revision range, selected through a prompt — the
   journey suggests `trunk merge-base...HEAD` (which spans the entire Graphite
   downstack from the current position) and shows what the range covers; the
   engineer confirms or overrides. No silent default.
2. **Review roster**: prompted as well — the applicable adversarial reviews for the
   confirmed range are shown and the engineer confirms/toggles the roster before
   anything runs.
3. **Run stage**: foreground with live per-review progress. A reviewer failure is a
   visible, source-attributed gap in the results, not a journey abort; the journey
   continues with the reviews that completed.
4. **Findings experience**: one aggregated, source-attributed findings report
   modeled on the existing downstack stack-feedback experience
   (`/ns:pr:download-stack-feedback` → combined Markdown report → `pr-address`
   triage), supporting **bulk** categorization and bulk triage decisions rather
   than forced item-by-item interaction.
5. **Triage → fixes**: mirrors the existing addressing mechanism — aggregated
   report → bulk triage → interactive steering with the engineer → a set of
   **planned PRs** (coherent, dependency-ordered batches). The engineer confirms
   the planned-PR set as one deliberate action before fix attempts start.
6. **Fix attempts**: the disposable ordinary slot/worktree produces **one local
   branch per planned PR**. Promotion means the engineer deliberately adopts
   chosen candidate branches into their own stack; unadopted branches die with
   the slot. Nothing touches the active checkout without adoption.
7. **Validation**: runs in the slot per candidate branch and attaches to that
   branch as evidence the engineer sees at inspection. Validation **informs,
   never gates** — adoption remains the engineer's call even on failure.
8. **Inspection/adoption**: one outcome report per planned PR (outcome, diff
   summary, validation evidence), followed by prompted per-branch adoption
   decisions, with the slot available for deep manual diff inspection.
9. **Success state — full accounting**: the journey completes when every finding
   carries an explicit disposition (adopted / rejected / deferred / failed /
   unattempted). Early exit leaves an honestly recorded incomplete state; findings
   are never silently dropped. Bulk triage keeps full disposition cheap (for
   example, one bulk "defer the rest").
10. **Resumability — stage boundaries**: the findings/triage record and the slot
    outcome record are durable checkpoints a fresh session can resume from;
    mid-stage interruption restarts that stage rather than resuming mid-flight.

A consistent interaction grammar emerged: every stage transition is
*report → prompted decision* (range, roster, planned-PR set, per-branch adoption),
which keeps execution authority explicit and generates the structured decision
artifacts future surfaces need.

## Objective Impact

- The first `(grilling)` Question Row — define the end-to-end local journey and
  its success states — is resolved and marked `[x]` in `roadmap.md`.
- The journey decisions bound, but do not resolve, downstream rows: the
  planned-PR shape feeds the local addressing contract row; branch-per-planned-PR
  and evidence-not-gate feed the autofix safety and validation rows; the two
  durable stage-boundary checkpoints (findings/triage record, slot outcome
  record) plus the full-accounting disposition set become concrete inputs to the
  reusable-artifact requirements row.
- Exercises the assumption that existing Reviews/Address capabilities compose:
  the journey deliberately reuses the downstack-feedback → triage → steer →
  planned-PRs mechanism for local findings.
- No Fog graduated: the resolved decisions sharpen existing rows rather than
  making new requirements questions specifiable.

## Follow-Ups

- The end-to-end journey row's blocked-by references now allow the prototype row
  to proceed once the addressing-contract, validation, and reusable-artifact rows
  resolve; no rewiring was needed.
- The stage-boundary checkpoint decision implies the findings/triage record and
  slot outcome record need durable, structured forms — carry this explicitly into
  the reusable-artifact requirements row when it is worked.
