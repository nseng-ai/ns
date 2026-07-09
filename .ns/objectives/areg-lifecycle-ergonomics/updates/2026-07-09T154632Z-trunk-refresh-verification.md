# Trunk refresh: contract verified, one stale example corrected

## Summary

Verified this planning-stage record against trunk `HEAD`
(`a814ebe365b9164fdcd31c3cf09c681be670c4f0`). No areg source changed after the record
was authored (`git log 1d3b90e35..HEAD -- ts/packages/tools/areg` is empty) and the
worktree is clean, so HEAD state equals authoring state. All five friction points were
re-confirmed open:

- Kind round-trip: no `areg skill reconcile` command exists; the `skill` group is
  `find`/`list`/`show`/`apply` only.
- Removal/cleanup: no `areg skill remove`, no doctor `--fix`; `doctor skills`
  cross-checks Pi inventory and `.pi/settings.json` exclusions but has no registry-row ↔
  installed-skill dead-row check.
- Apply ordering churn: `areg skill apply` still reconciles the exclusion list without a
  documented position-preserving/sorted write.
- Hash semantics: `check` validates `computedHash` format only (placeholder / 64-hex),
  never content against the vendored dir; no recorded-fork marker exists.
- Implied-kind surfacing: `skill-kind-inference` carries implied-state notes but there is
  no self-evident mismatch signal in `show`/`check` as scoped.

Supporting facts verified present at HEAD: `agents/openai.yaml` overlay handling
throughout areg source, `docs/conventions/upstream-skill-melding.md`, `skills-lock.json`,
`@nseng-ai/harness-artifacts`, and remote branch `pocock-upstream-refresh-melding-process`.

One stale fact corrected in Scope item 2: the record cited the `ts-morph-refactor` row as
a live "pre-existing dead row not flagged," but that row was removed in commit
`709828e3e` (2026-07-08 12:05), two minutes before the record was authored
(`1d3b90e35`, 12:07). The generalized friction — no mechanical dead-row detection —
remains true, so the item stands; only the illustrative example was corrected to reflect
that the observed row was hand-removed and nothing catches the next one.

## Objective Impact

No scope, criteria, or roadmap change. Record remains fully open, planning-stage, all
five roadmap rows `[ ]`, no work landed. Only a stale illustrative example in Scope item
2 was corrected for forensic accuracy.

Provenance: objective-refresh basis target=a814ebe365b9164fdcd31c3cf09c681be670c4f0 from=trunk-HEAD

## Follow-Ups

None. Not closure-ready: no friction point is implemented.
