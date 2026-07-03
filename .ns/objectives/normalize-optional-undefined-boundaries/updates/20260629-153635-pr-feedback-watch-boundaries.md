# PR Feedback Watch Boundaries

## Summary

Completed the PR feedback watch state/event normalization slice. PR #2396 / the current branch diff from `normalize-stack-map-branch-collections...HEAD` tightens `ts/packages/local-pi-tools/pr-feedback-watch/src/feedback-watch/model.ts` so internal watch models no longer expose `?: T | undefined`; normalizes controller status, snapshot, and event construction to omit absent fields; hardens persisted watch event parsing so malformed restore-relevant legacy entries are ignored; and updates fingerprint parsing/key construction to omit missing optional fields after REST/JSON boundary parsing.

Before/after inventory for this slice:

- `model.ts`: 25 `?: T | undefined` candidates to 0.
- Broader `src/feedback-watch` plus tests: 35 candidates to 7.

The remaining seven slice hits are preserved compatibility/input boundaries: UI status clearing in `controller.ts` and GitHub REST/options/query parameter surfaces in `github.ts`.

Validation evidence recorded from implementation: `pnpm --dir ts --filter @local-pi-tools/pr-feedback-watch check`, `pnpm --dir ts --filter @local-pi-tools/pr-feedback-watch test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just ts-test` passed.

## Objective Impact

This completes the `Normalize PR feedback watch state and event models` roadmap row. The watch-state modeling question is resolved for this Objective: internal status, event, fingerprint, and snapshot records represent absence by omission after boundary normalization, while true gateway/input surfaces continue to accept explicit `undefined` where it is a control signal or external API convenience.

This also advances the candidate rebaseline row with PR feedback watch before/after counts and preserved-boundary rationale.

Objective PR evidence:

- PR #2396: Normalize watch state restore and event serialization — completes the PR feedback watch state/event normalization slice and adds restore coverage for normalized and malformed events.

## Follow-Ups

- Continue with the remaining small internally constructed diagnostics/result model classification: kernel command/extension diagnostics, packagechk results, areg replacement info, and check-count `hasMore` models.
- Keep the final candidate rebaseline row open until remaining clusters have before/after counts and preserved/deferred rationale.
