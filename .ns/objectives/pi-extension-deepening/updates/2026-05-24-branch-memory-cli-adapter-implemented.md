# Branch Memory CLI Adapter Implemented

## Summary

Candidate 4 has been implemented as a narrow Branch Memory CLI Adapter slice.

- Added `brmem-cli.ts` with `resolveBrmemCommandCandidates`, `runBrmemCandidate`, `runFirstAvailableBrmemCommand`, and unavailable-command error formatting.
- The adapter centralizes discovery order and fallback across nearest ancestor `.venv/bin/brmem`, PATH `brmem`, and `uv run --directory <project-root> brmem` when a `pyproject.toml` ancestor exists.
- Migrated `create-brmem-plan.ts` and `worktree-status.ts` to the shared adapter.
- Preserved caller policy differences: `persist_brmem_plan` still raises detailed fatal errors when no Branch Memory command is available, while `worktree-status` still degrades nonfatally to `unavailable` when Branch Memory output cannot be loaded.
- Added fake-driven tests for discovery ordering, unavailable commands, fallback behavior, fatal create-brmem-plan errors, and nonfatal worktree-status degradation.

Verification: `bun run --cwd ts check` passed; `bun run --cwd ts test` passed.

## Objective Impact

Candidate 4 is complete. The accepted seam is Branch Memory command discovery and candidate execution, not Branch Memory domain parsing in general. This confirms the adapter passes the deletion test: without it, `.venv` / PATH / `uv run` fallback knowledge and command-unavailable handling would be duplicated by each Branch Memory Pi extension consumer.

Candidate 3 remains open because framework Machine-envelope parsing is a separate contract. Branch Memory `put` payload validation and status-list degradation still live with their callers until a shared Clinkr envelope parser proves its own leverage.

## Follow-Ups

- Continue the ranked roadmap with Candidate 3, the Clinkr Machine envelope parser.
- Reuse `brmem-cli.ts` for future Branch Memory Pi extension consumers instead of reimplementing command discovery.
- If Candidate 3 is accepted, share only framework envelope facts unless domain payload validation also proves a deeper common Interface.
