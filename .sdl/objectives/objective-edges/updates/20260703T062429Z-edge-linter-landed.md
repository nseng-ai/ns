# Edge/blocked linter live in check; sweep spelling resolved as --all

## Summary

The linter roadmap row is complete on local branch `objective-edges-linter` (verified
runner-step commit, stacked on the reader branch). `src/core/operations/edge-lint.ts` builds on
the shared frontmatter reader and reports every enumerated structural violation as an error:
malformed frontmatter, empty blocked sentence, empty annotation, invalid slug, self edge,
duplicate pair, dangling endpoint, and missing mirror side, with counterpart resolution across
the active and archive roots. Per-slug `sdl objective check <slug>` folds the lint in; the
repo-wide sweep is `sdl objective check --all` (`-a`), wired into `just check` and a dedicated
CI job. Full `just` green (4040 tests); the sweep passes on the current 120-record checkout.

## Objective Impact

The linter-enforced-symmetry argument from ADR 0025 is now machine-enforced and CI-blocking,
de-risking the "mirrored storage plus CI symmetry linter is sufficient" assumption. The two
hardenings the reader deliberately deferred (malformed frontmatter, empty blocked sentence)
are now errors.

Decision: the open sweep-spelling question is resolved as `sdl objective check --all`, scoped
to edge/blocked structural lint only. Finding behind it: 41 of 120 existing records fail
legacy update-file heading lints, so a full-check sweep cannot gate CI today; widening `--all`
to the full per-record check would first require fixing those records. No-slug behavior stays
a usage error.

The list-rendering, skill, and seed rows are unblocked; the seed row's acceptance evidence
(sweep passing on a checkout with live frontmatter) is now runnable.

## Follow-Ups

- Pre-existing UX gap (not this Objective's scope): per-slug `failed` checks render only the
  negative message without the checks table in human format; the sweep attaches its violations
  table.
- If anyone later wants `--all` to mean the full per-record check, the 41 legacy
  heading-lint-failing records must be fixed first.
