# Objective and Slot Tail Buffered Migration

## Summary

Migrated the remaining eligible Objective/Slot P1 tail surfaces to the signed-off CLI house style:

- `sdl objective check` now renders a buffered status/check report with key/value facts and a themed checks table.
- `sdl objective archive` / `--unarchive` now render status-aware finite result blocks for success, refusal, and failure outcomes.
- `sdl slot claim` and `sdl slot init` now render concise action/result blocks.
- `sdl slot foreach` now renders a command title, success/failure summary, themed per-slot table, and bounded stdout/stderr output sections.

## Objective Impact

This completes the remaining mechanical eligible tail listed in `cli-surface-audit.md` for Objective and Slot command faces. The final tail reused `@sdl/cli-theme` directly (`renderResultBlock`, `kv`, `renderTable`, `cell`, `paint`) and did not reveal a need for a new generalized report wrapper.

Machine result schemas, exit semantics, mutation behavior, confirmation behavior, and existing `slot foreach` output tail bounds remain unchanged.

## Follow-Ups

- Keep standalone/unported surfaces extension-gated until a later extension-architecture eligibility pass.
- Use Objective closure review as the next lifecycle step once broader repo validation evidence is collected.

## Validation evidence

- Passed: `pnpm --dir ts --filter @sdl/objective test`
- Passed: `pnpm --dir ts --filter @sdl/slot test`
- Passed: `pnpm --dir ts run check`
- Formatting was fixed with `just ts-format-fix` after `pnpm --dir ts run fmt:check` identified formatter changes.
