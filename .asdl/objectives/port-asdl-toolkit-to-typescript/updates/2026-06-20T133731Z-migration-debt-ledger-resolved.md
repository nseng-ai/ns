# Migration Debt Ledger Resolved

## Summary

Resolved `.asdl/objectives/port-asdl-toolkit-to-typescript/migration-debt.md` as the final migration-closure blocker.

The cleanup reviewed every open ledger entry against live TypeScript code evidence instead of treating the original 2026-06-10 assumptions as still binding. Current evidence:

- `@asdl/clinkr/legacy` / `legacyCommand` remains active only for `plans` and `branch-context` command surfaces outside clinkr tests. These are stable agent-facing compatibility adapters, not a remaining Python fallback.
- Snake-case JSON fields remain part of external command/schema/persisted payload contracts such as `exit_code`, `error_type`, `pr_number`, slot lifecycle details, vibechk bundles, and aretro evidence payloads.
- The clinkr v1 machine envelope is now the TypeScript command contract consumed by first-party TS packages and Pi/runtime parsers; its value is no longer Python implementation parity.
- `@asdl/clinkr/raw` / `rawCommand` is used by active TS surfaces (`sdl`, `ccc`, `packagechk`, `roaster`, `sdlcc`, `vibechk`) as an intentional byte-owning command mode.
- The Objective-local legacy machine projection had already been killed by PR #1726 / commit `dc225c5de`.
- The remaining `isCliUsageError` stderr-prefix sniff in `pi-extensions` is a narrow editor-restoration UX/API cleanup, not a language-migration blocker.

Ledger decisions:

- Recommitted bounded legacy adapters, snake-case external JSON/schema fields, the clinkr v1 machine envelope, and raw byte-owning command mode as accepted current contracts.
- Killed the documented CLI-surface divergence debt and retained the earlier Objective-local projection kill as historical closure evidence.
- Moved structured Pi CLI usage-error classification out of the migration closure path as parked UX/API follow-up.

## Objective Impact

This completes the migration-debt portion of the final migration cleanup. The umbrella Objective no longer has an open end-of-migration debt ledger item blocking closure: remaining framework/API ideas are parked as future compatibility or UX improvements rather than unfinished Python-to-TypeScript migration work.

The roadmap now marks both the debt-ledger row and final migration cleanup row complete, and the Objective narrative records that root `asdl exec` disposition, stale docs/context rebaseline, and debt-ledger cleanup have completed.

## Follow-Ups

- If the project wants a Clinkr/agent-command v2, create a separate focused Objective for compatibility planning around machine envelope, schema casing, bounded legacy adapters, and raw-mode migration candidates.
- If `registerCliCommandExtension` / `runCli` is redesigned, carry usage-error classification structurally and remove the `isCliUsageError` stderr-prefix sniff.
- The umbrella migration Objective is now a candidate for final readback and `objective-close` after ordinary validation/review.
