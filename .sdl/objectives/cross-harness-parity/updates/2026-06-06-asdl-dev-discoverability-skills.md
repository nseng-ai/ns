# Closed asdl-dev discoverability gaps

## Summary

The `asdl-dev` parity gap is closed for the audited surfaces. `dev-preview-url` now drives `asdl-dev preview-url`, `internal-code-submit` now drives `asdl-dev submit`, and `internal-code-checkpoint` was changed to delegate to `asdl-dev cp` instead of reimplementing checkpoint staging and commit-message logic with raw git commands.

Evidence: the local branch diff adds the two new internal skills and their `.agents` / `.claude` symlink installs, updates `skills-lock.json`, rewrites `internal-code-checkpoint`, and moves `/dev:preview-url`, `/code:cp`, and sibling-owned `/code:submit` to FULL in `parity-table.md`. Validation: `dprint check` passed for the changed Markdown/JSON files; `INSTALL_INTERNAL_SKILLS=1 npx skills list` showed all three skills installed; `asdl-dev preview-url --help`, `asdl-dev cp --help`, and `asdl-dev submit --help` all ran successfully.

## Objective Impact

The Objective no longer has an unexplained `asdl-dev` discoverability gap. `/dev:preview-url` and `/code:cp` are now fully owned parity rows here, and `/code:submit` has the missing skill pointer while remaining tracked as sibling-owned by `asdl-dev-submit-consolidation`. The checkpoint duplication decision is resolved in favor of the shared CLI: `asdl-dev cp` owns the deterministic checkpoint contract, and the skill is only a cross-harness entrypoint.

## Follow-Ups

- Continue with the remaining orphan rows: `/handoff:list` duplication, parity-review skill, `land-stack`, cmux dispatch, autobranch, `/code:land`, and `/code:changes`.
- Keep future skill prose at the CLI-operation level so public-facing skills do not reintroduce internal implementation references or parallel orchestration.
