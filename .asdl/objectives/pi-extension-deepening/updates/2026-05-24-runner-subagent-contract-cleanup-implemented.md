# Runner Subagent Contract Cleanup Implemented

## Summary

Candidate 9 has been implemented as a small runner-subagent contract cleanup.

- Updated `docs/pi/runner-subagent-helper.md` to describe the helper API, runtime internals, and generic `dispatch_runner_subagent` tool separately.
- Documented terminal-capture mode and final-text mode as distinct caller contracts, including `stopped-without-useful-text` and the rule that final-text consumers must treat non-`final-text` statuses as diagnostics.
- Refreshed `docs/pi/objective-stack-subagent-rewrite-brief.md` and `docs/pi/README.md` to use runner-subagent terminology while explicitly labeling `runChildSession(...)` as historical/prototype wording.
- Added `runner-subagent/presentation.ts` as a narrow pure presentation helper for elapsed formatting, display title/session extraction, and generic progress widget lines.
- Migrated `dispatch-runner-subagent.ts` and `runner-subagent-demo.ts` to the helper while keeping final-text tool messaging and demo terminal payload rendering local.
- Added focused helper tests and strengthened `dispatch_runner_subagent` tests so terminal-capture and diagnostic statuses do not look like final-text completion.

Verification: `bun run --cwd ts check` passed; `bun run --cwd ts test` passed.

## Objective Impact

Candidate 9 is complete. The accepted seam is generic runner-subagent presentation metadata, not a broad renderer framework: elapsed formatting, display title/session fallback, and generic widget lines are shared because deleting the helper would reintroduce duplicated parent-facing runner-subagent presentation knowledge in both the generic tool and demo.

The runner-subagent docs now distinguish terminal-capture completion from final assistant text completion, and Objective-stack guidance no longer presents child-session / `runChildSession(...)` wording as current guidance. `dispatch_runner_subagent` remains final-text oriented and continues to warn that non-`final-text` statuses require diagnostics/session inspection before completion is assumed.

Evidence: local working diff against Graphite parent `clinkr-machine-envelope-parser`.

## Follow-Ups

- Continue the ranked roadmap with Candidate 5 or the next explicitly selected candidate.
- Keep domain-specific terminal payload rendering local unless another deletion-test-backed seam appears.
- Future Objective-stack work should use `dispatchRunnerSubagent(...)` and runner-subagent terminology consistently.
