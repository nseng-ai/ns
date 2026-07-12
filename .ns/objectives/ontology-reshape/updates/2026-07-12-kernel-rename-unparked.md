# Kernel rename unparked: direction decided, mechanics row enters the Frontier

## Summary

The Parked row "Decide the `@nseng-ai/kernel` name" unparked. Its revisit trigger
fired — the `extension-descriptor-contract` Objective closed 2026-07-11 ("Closed:
completed") — and the user decided the direction in a live session on 2026-07-12:
the kernel brand retires and the concept renames to **sdk** throughout the ontology
(package identity, import subpaths, folded `@nseng-ai/ns` re-exports, glossaries,
author docs, and prose surfaces).

Because the premise is settled, the row re-enters the Frontier not as the original
name-decision grill but as a mechanics-only grilling row: "Spec the kernel → sdk
rename". The HITL session settles the *shape* of the rename, exiting per the
reshaping handoff vehicle as spec + ADR, then graduating an execution task row.
Execution never starts in the decision session.

The headline mechanics the row carries (inventoried 2026-07-12; re-enumerate at
spec/execution time): a three-way `sdk` collision — the kernel package's own
`ns.tier` is already `sdk`, the public author subpath is `@nseng-ai/kernel/sdk`
(~176 imports across 17 packages; a naive package rename yields the
`@nseng-ai/sdk/sdk` stutter), and the root glossary holds an "SDK boundary" term —
plus the folded `@nseng-ai/ns` `./kernel/*` re-exports, ~20 "kernel-" glossary
terms, the author-facing docs, and word-boundary safety for every rename pair.

## Objective Impact

- Roadmap: the Parked section emptied and was removed; the new open grilling row
  sits in `## Work` with the other open grilling rows, carrying the unpark
  provenance and dated inventory caveats.
- `docs/wayfinding/ontology-reshape/layering-reshape-spec.md` Parked section
  annotated: the kernel rename unparked 2026-07-12 into the roadmap's grilling
  row. ADR 0033 itself stays untouched as an immutable record.
- The "no new kernel-brand prose" restraint from the parked row holds until the
  spec lands — root `CONTEXT.md` untouched by this update.

## Follow-Ups

- Run the grilling session (HITL) to settle the rename mechanics; exit as
  spec + ADR per the reshaping handoff vehicle, then graduate an execution task
  row.
- Re-enumerate the volatile inventory facts (import counts, glossary-term counts)
  at spec and execution time; the 2026-07-12 numbers are dated snapshots.
