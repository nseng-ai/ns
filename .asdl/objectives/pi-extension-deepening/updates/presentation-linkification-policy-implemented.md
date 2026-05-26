# Presentation Linkification Policy Implemented

## Summary

Candidate 6 has been implemented as a narrow terminal presentation helper slice.

- PR #616 extracts `terminal-presentation.ts` with pure helpers for terminal escape stripping, URL validation, OSC 8 hyperlink construction, custom-message text extraction, display-line truncation, PR-link details parsing/building, and `#<number>` PR-reference linkification.
- PR #616 migrates `command-runtime`, `land-stack`, and `runner-subagent-demo` to the shared helpers, with focused tests for sanitizer, OSC stripping, details parsing, and renderer behavior.
- PR #617 keeps `worktree-status` behavior local and only reuses the shared URL validation / OSC 8 construction helpers, deleting its local duplicates.
- The exploratory worktree-status custom message renderer was removed from this slice because it was a separate behavior change, not helper consolidation.
- `.pi/extensions/submit.ts` remains deferred to Candidate 10 / vibecoded extension promotion triage.

Verification: `bun run --cwd ts check` passed; `bun run --cwd ts test` passed.

## Objective Impact

Candidate 6 is complete. The accepted seam is the small pure terminal presentation helper Module, not a broad renderer framework. The Objective risk about premature extraction is now better understood: centralizing security-sensitive terminal URL/OSC policy has value, but broader message-rendering policy needs a separate deletion-test-backed decision before implementation.

## Follow-Ups

- Continue the ranked roadmap with Candidate 4, the Branch Memory CLI Adapter.
- If worktree-status chat-message linkification is still desired, reconsider it under Candidate 7 or a separate explicit feature slice rather than treating it as helper consolidation.
- Revisit `.pi/extensions/submit.ts` during Candidate 10 promotion / retirement triage.
