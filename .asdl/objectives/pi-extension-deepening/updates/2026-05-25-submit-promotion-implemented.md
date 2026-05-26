# Submit Promotion Implemented

## Summary

Candidate 10's accepted `/submit` promotion has been implemented.

- Moved the former project-local `/submit` implementation into `ts/packages/pi-extensions/src/submit.ts`.
- Replaced `.pi/extensions/submit.ts` with the thin Pi discovery adapter shape used by the other engineered extensions.
- Added structural Pi/TUI types inside the package module so the package still avoids runtime imports from Pi host packages.
- Added a `/submit`-specific `SubmitCommandRunner` seam with buffered and streamed methods, backed in production by the existing Node `spawn` behavior.
- Preserved the Graphite/git command choreography: dry-run, optional restack, streamed `gt submit`, current-PR verification, conflict checks, semantic empty-branch failure detection, PR-link extraction, timeout/startup-error formatting, and no-UI fallback output.
- Added fake-driven package tests for registration, PR-link success, dry-run failure, restack decline/success/conflict, semantic failure, current-PR failure, startup error, timeout, and no-URL fallback.
- Updated `docs/pi/README.md` so `/submit` is listed as a project-local adapter over engineered behavior.

Verification: focused `bun test ts/packages/pi-extensions/test/submit.test.ts` passed; `bun run --cwd ts check` passed; `bun run --cwd ts test` passed.

## Objective Impact

The accepted high-risk `/submit` implementation slice is complete. `/submit` is no longer a vibecoded implementation; the local discovery file is only an adapter, and the durable behavior now has package-level fake-driven tests that do not invoke real `gt`, `gh`, or mutating git commands.

Candidate 2 is also decided from this evidence: keep `command-runtime.ts` narrow and do not introduce a broad generic command runtime now. The new runner seam is deliberately `/submit`-specific because the repeated behavior proven by this slice is Graphite submit/restack/current-PR process behavior plus `/submit` presentation policy, not a general command lifecycle abstraction.

Behavior-preserving compromise: progress truncation now uses the package-local terminal presentation helper rather than importing Pi TUI directly. The broader presentation/linkification question stays as a follow-up instead of expanding this slice.

Evidence: local working diff against Graphite parent `update-land-stack-test-interface-cleanup`; PR evidence was unavailable because the branch had no PR at update time.

## Follow-Ups

- Consider moving buffered `/submit` subcommands such as dry-run, restack, `gt pr`, and git conflict checks to `pi.exec` only if tests show no diagnostic or UX regression.
- Consider whether PR-link extraction or OSC notification formatting belongs in `terminal-presentation.ts` after another caller proves the same policy.
- Revisit a broader command runtime only after another concrete consumer proves repeated buffered/streamed lifecycle semantics beyond `/submit`.
