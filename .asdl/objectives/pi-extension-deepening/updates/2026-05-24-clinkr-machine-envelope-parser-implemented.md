# Clinkr Machine Envelope Parser Implemented

## Summary

Candidate 3 has been implemented as a narrow Clinkr Machine envelope parser slice.

- Added `machine-envelope.ts` with `parseMachineEnvelopeData(stdout, { label, stdoutTail })` for framework-level JSON envelope parsing.
- The parser owns syntactic JSON failures, non-object envelope failures, strict numeric `exit_code` validation, nonzero exit diagnostics with optional `message` / `error` text, object `data` extraction, and optional bounded stdout tails.
- Added focused parser tests for valid envelopes, invalid JSON, bad envelope shapes, missing/non-numeric/nonzero `exit_code`, invalid `data`, and tail inclusion/omission.
- Migrated `objective-list.ts` and `brmem-plans/plan-persistence.ts` to the shared parser while leaving their domain payload validation local.
- Migrated `worktree-status.ts` to the shared parser for Branch Memory list envelopes while preserving candidate fallback and nonfatal degradation to `unavailable`.

Verification: `bun run --cwd ts check` passed; `bun run --cwd ts test` passed.

## Objective Impact

Candidate 3 is complete. The accepted seam is the Clinkr Machine framework envelope only: JSON parsing, top-level envelope object shape, numeric `exit_code`, nonzero status diagnostics, and object `data` extraction. The implementation intentionally does not become a generic schema system and does not move Objective-list fields, Branch Memory `put` fields, or Branch Memory status-entry validation out of their callers.

The strict `exit_code` choice means test fixtures that represent Machine envelopes should include `exit_code: 0`; loose or malformed status output still degrades nonfatally in `worktree-status` by trying later candidates and then returning `unavailable`.

Evidence: local working-tree diff against Graphite parent `extract-brmem-cli-adapter-and-migrate-callers`.

## Follow-Ups

- Continue the ranked roadmap with Candidate 9 or the next explicitly selected candidate.
- Keep `machine-envelope.ts` limited to framework envelope parsing unless another deletion-test-backed seam appears.
- If future Branch Memory or Objective fixtures omit `exit_code`, update them to true Machine envelopes rather than broadening the parser without a deliberate compatibility decision.
