# Publication and Inline Modules Recorded

## Summary

The Objective tracking now reflects that TS roaster's findings publication and inline-commentability pure modules are present in the source tree and covered by direct unit tests. `findings-publication.ts` supplies TS-native summary and inline markers, findings payload parsing from clinkr-style envelopes, inline status parsing, aggregate comment rendering, inline body rendering, and activity-log preservation. `inline-commentability.ts` classifies review findings against GitHub changed-file patch snippets and records fallback-only reasons for findings that cannot be posted inline.

Evidence: `master` already contains `ts/packages/roaster/src/findings-publication.ts`, `ts/packages/roaster/src/inline-commentability.ts`, and their matching unit tests; recent file history includes the publication/inline helper commits. Verification: `pnpm --dir ts exec vitest run --config vitest.config.ts packages/roaster/test/unit/findings-publication.test.ts packages/roaster/test/unit/inline-commentability.test.ts` passed.

## Objective Impact

This completes the roadmap row for findings publication and inline-commentability as pure tested modules. It also advances the domain/error-model row because TS-native markers and internal findings-envelope parsing now exist, but that broader row remains in progress until the `review run` and hidden `exec` commands wire those models into the functional CLI path.

The GitHub gateway risk is partially reduced for pure line-classification and comment-rendering behavior, while real GitHub comment-path coverage remains open until the TS CI flow exercises changed-file loading, batched review creation, and summary-comment create/update on a real PR.

## Follow-Ups

- Wire the implemented publication and inline-classification modules into the hidden `exec` commands.
- Keep the GitHub gateway row in progress until all comment paths are exercised by the TS CI flow.
- Continue to defer Python package deletion until the TS CLI and workflow cutover are proven green end to end.
