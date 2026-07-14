# README revised to submit-specific design; recovery point id settled

## Summary

A grilling session over the README revision resolved every open contract decision the
2026-07-12 steering update left behind, and `references/README-draft.md` was rewritten
accordingly. Settled decisions (all confirmed by the user):

- Recovery prompt point id is **`flow.submit.pre.recovery`** — nested under the retained
  check point; conventional override at `.ns/prompts/flow.submit.pre.recovery.md`. The
  superseded `flow.validation.recovery` name is gone from the draft.
- User-facing vocabulary is **"pre-submit checks"**; the `--no-hooks` flag migrates to
  `--no-checks` in the implementation slice (ns is unreleased, no legacy caveat).
- The stable failure marker is a **documented public harness contract**: the README names
  the exported constant (`FLOW_SUBMIT_CHECK_FAILURE_MARKER`) and tells harness authors to
  key off the marker line, never prose.
- No flow listing verb: adopters inspect installed checks via `ns extension points` /
  `ns extension point flow.submit.pre`.
- Recovery scope is promised as **submit-only** — fires only for `ns flow submit`
  pre-check failures; no general marker-driven rule that would re-import the abandoned
  gates framing.
- Default recovery prompt guidance: fix the root cause, never bypass checks, rerun the
  failing check command to confirm green, then rerun `ns flow submit`.
- Open questions kept in the draft: the LLM/model seam and the pending repo-specificity
  audit of `autobranch`/`autoslot`/`land`/`pull-trunk`. The moot validate-listing
  question was dropped.

## Objective Impact

The README draft no longer describes the superseded general-gates design; `ns flow
validate`, the gate taxonomy, and `flow.validation.*` ids are removed. The open question
in `objective.md` about the recovery point id is answered. The submit pre-check contract
slice and recovery slice are now unblocked on the README side: they implement
`FLOW_SUBMIT_CHECK_FAILURE_MARKER`, the `--no-checks` rename, and the
`flow.submit.pre.recovery` point (kernel built-ins + flow descriptor together, per the
duplication risk). `references/validation-gates-plan.md` remains superseded where it
proposes the point rename, gates module, or standalone command and still needs revision
before implementation. The README loop is not finished — the model-seam and audit
questions still gate promotion.

## Follow-Ups

- Revise `references/validation-gates-plan.md` around the settled contract
  (`flow.submit.pre` retained, `flow.submit.pre.recovery`, marker constant name,
  `--no-checks`) before executing the implementation slices.
- Resolve the two remaining README open questions (model seam; audit findings) before
  promotion to `ts/packages/capabilities/flow/README.md`.
