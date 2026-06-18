# Strict Claim Verification Pass

## Summary

A stricter `objective-branch-refresh` pass treated the Objective's material claims as untrusted and verified them against current repository ground truth. The four roaster candidates remain relevant: `src/findings-publication.ts` and the individual exec tests exist, while `.github/workflows/roaster.yml` still uses three exec commands, temp files, and repeated envelope parsing; `ReviewDefinition`, `ReviewApplicability`, and `DiffFile` still have schema/type twins; `RoasterCliContext` still wraps `RoasterContext` and handlers repeatedly pass `{ cwd, env }`; `RoasterFailure` still carries structured fields that command seams mostly collapse to `failureMessage(error)`.

Provenance: objective-branch-refresh basis tip=3550f03b2d551602fc5e4a6fdad2dba376cec8f2 from=ef9cc9aa61b46aedf07c90d8032f8e61cde9838e

## Objective Impact

Candidate 3 was narrowed: current handlers do not thread a top-level `signal`, although lower gateway option types support cancellation. The Objective and roadmap now describe binding `cwd`/`env` at `runCli` and making cancellation part of that slice's design decision rather than asserting that `signal` is currently re-threaded everywhere.

## Follow-Ups

- Candidate 3 implementers should inspect cancellation support explicitly before deciding whether to add `signal` to the bound run environment.
- Continue treating the three current publication exec commands as user-invocable until caller evidence justifies deleting them instead of wrapping them.
