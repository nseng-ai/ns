# Clinkr test polish and integer contract

## Summary

The current branch `pr-address-ts/fu-clinkr-test-polish`, compared with Graphite parent `pr-address-ts/fu-stack-feedback-split`, is a follow-up polish slice for the completed clinkr shell and test-scaffolding work.

Durable meaning if this branch lands:

- TypeScript clinkr integer parsing is explicitly documented and tested as stricter than Python click for edge cases: `+5`, whitespace-padded numbers, and underscore-separated numbers are usage errors, alongside the already-rejected fractional, exponential, and hex forms.
- `markdown` and `md` `--format` choices continue to render through the human channel until clinkr has a distinct markdown renderer.
- pr-address test scaffolding is tighter: golden case discovery fails when a fixture directory has zero cases, the manifest/classification wrapper helper is shared, wrapper tests reuse the shared temp-directory support, and several local test-only indirections are removed.
- Fake gateway stderr literals are kept module-local now that no external test imports need them; byte-pinned fixture values themselves remain unchanged.

Validation evidence: `pnpm --dir ts run check` and `pnpm --dir ts run test` passed on the current branch.

## Objective Impact

No roadmap row status changes. This strengthens the already-completed clinkr shell migration, strict-integer compatibility correction, and test-scaffolding consolidation rows.

The Objective now records the integer edge policy as an accepted TypeScript contract rather than leaving future agents to infer whether the `+5`/whitespace/underscore behavior is an accidental click-parity gap.

The stale open question about `stack-feedback-prep` parallel fetch was also moved to resolved Objective prose using the existing structural/dedup evidence: parallel fetch is on by default, first failure still resolves in input order, and artifact writes remain sequential for byte-visible parity.

## Follow-Ups

- Continue with the remaining endgame rows: `bundle-distribution`, `plugin-retirement`, `python-deletion`, and `playbook`.
- Do not reopen the completed clinkr shell or test-scaffolding rows for this polish slice unless new evidence shows a public CLI, envelope, fixture, or wrapper contract regression.
- Treat the stricter decimal-integer policy as settled unless the user explicitly asks to broaden TypeScript parsing for Python click's `+`, whitespace, or underscore acceptance.
