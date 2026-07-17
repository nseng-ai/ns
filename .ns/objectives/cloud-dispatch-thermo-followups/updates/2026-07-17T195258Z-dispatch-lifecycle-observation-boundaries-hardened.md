# Dispatch Lifecycle and Observation Boundaries Hardened

## Summary

The dispatch workflow now persists a safe sandbox name in a dedicated zero-retry creation step before checkout reads, context preparation, provisioning, or detached launch. A second zero-retry step prepares and launches the harness, and deterministic orchestration uses the durable name to attempt cleanup for both returned and thrown post-create failures while preserving cleanup-failure precedence.

`DispatchDiagnosticError` payloads are reconstructed through the normal identifier, status, redaction, and truncation rules with the outer operation authoritative. Workflow event serialization, primary sinks, status-stream failures, safe failure markers, and writer-lock release are all best-effort. The canonical Vercel Workflow inspection skill now bounds non-terminal evidence with a UTC observation cutoff and labels it active/open-ended rather than treating collection time as run end.

## Objective Impact

H10 and M19–M21 are complete with local evidence. Focused lifecycle, diagnostic, observability, and workflow tests passed (134 tests); the full Vercel package passed (749 tests); focused and workspace typechecks, `areg check`, Objective checks, formatting, lint, style guard, and the full `just` gate passed. The new lifecycle evidence narrowly supersedes only the older clean attestation that one combined zero-retry launch step was sufficient. Generic module splitting remains rejected, and report-comment pagination remains parked with L9.

`build:deployable` was attempted but stopped before building because this worktree lacks local Vercel project settings and non-interactive `VERCEL_TOKEN` authentication. No deployable-build success, deployment, billable sandbox execution, workflow trigger, or live dispatch proof is claimed.

## Follow-Ups

- Run `build:deployable` later from an authorized, linked Vercel environment before any deployment claim.
- Continue H1, H2, and the remaining thermo-review rows independently.
- Keep full report-comment pagination parked until the existing L9 concurrency trigger materializes.
