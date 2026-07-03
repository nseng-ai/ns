# Shared Record Frontmatter reader adopted by all four objective.md readers

## Summary

The enabling roadmap row is complete on local branch `objective-record-frontmatter-reader`
(verified runner-step commit, stacked on the ADR branch). A pure module
`ts/packages/capabilities/objective/src/core/record-frontmatter.ts` parses the closed
`blocked`/`edges` schema on top of `@sdl/core/markdown-frontmatter` plus YAML, and
`ObjectiveStorage.readObjectiveRecordDocument` is the storage-layer seam every `objective.md`
reader consumes. Check heading lints now lint the frontmatter-stripped body; `read-objective`
keeps record content verbatim and adds an optional `recordFrontmatter` field only when a fence
exists; `list` and `load-orientations` are pinned by contract tests to identical output for
records with and without frontmatter. Full `just`, ts-test (4020 tests), integration, and
style-guard suites green; live CLI verified against a scratch frontmattered record.

## Objective Impact

The assumption that frontmatter can be introduced without breaking existing tooling is now
de-risked in code: the reader inventory named in `## Scope` is adopted and the with/without
contract is test-pinned. The linter and list-rendering rows are unblocked and should build on
`splitObjectiveRecordDocument`/`readObjectiveRecordDocument` rather than re-parsing.

Decision recorded: malformed-frontmatter handling is deliberately minimal in the reader — an
unclosed fence strips nothing; a well-delimited but invalid block is `malformed` with the block
stripped so fence/YAML lines are never treated as record content; an empty block and an
explicitly empty `blocked:` string are accepted as well-formed for now. Hardening (including
empty-blocked-sentence as an error) is the linter row's job.

## Follow-Ups

- Linter row: report malformed frontmatter and empty blocked sentences as errors, resolve slugs
  across active and archive roots, and wire the repo-wide sweep into `just`/CI.
- No checked-in record carries frontmatter yet; the seed row remains gated on the linter for
  its acceptance evidence.
