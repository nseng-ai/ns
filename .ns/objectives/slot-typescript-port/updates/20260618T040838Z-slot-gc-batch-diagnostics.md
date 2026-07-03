# Slot GC Batch Lookup and Gateway Diagnostics

## Summary

Recorded the landed-state meaning of branch `batch-github-pr-lookup-worktree-probes` for the TypeScript `slot` port.

The branch improves the already-ported `slot gc --delete-branches` release path by batching GitHub PR lookup for candidate branches, avoiding repeated per-marker git subprocess probes for worktree operation state, and adding an opt-in slot-local command diagnostic layer at the git/gh gateway boundary. The diagnostics write JSONL to `ASDL_SLOT_DIAGNOSTIC_LOG` and preserve machine-readable command stdout, including `--format json`, by not emitting diagnostics to stdout.

Evidence considered:

- Graphite parent: `slot-graphite-remediation-review`.
- Local committed diff against that parent: commits `a742bc561` (`[cp] Batch PR lookup in gc`) and `998e79f1d` (`[cp] Add command diagnostics to slot gateways`).
- Touched TypeScript files include `ts/packages/slot/src/lifecycle/gc.ts`, the slot git and PR gateways, fake PR gateway support, `ts/packages/slot/src/diagnostics.ts`, and focused gateway/scenario/unit tests.
- PR evidence was unavailable because no current-branch PR was found; local committed branch evidence was sufficient.
- Validation reported for the branch: slot package check/test, full TypeScript workspace check/test, `just dprint-check`, and a smoke check confirming `slot gc --dry-run --delete-branches --format json` remains valid JSON while diagnostics are written separately.

## Objective Impact

This strengthens the completed `Port release: free and gc` row rather than opening a new command-surface row. The user-facing release contract remains unchanged, while the `gc --delete-branches` implementation is less exposed to serial GitHub/API fanout and future slot git/gh gateway fanout is easier to diagnose through labeled command events.

The update also de-risks the Objective's worktree-state and release-path risks: direct worktree admin-file probing preserves operation-state semantics without repeated marker subprocesses, and command diagnostics make future performance investigations reproducible without compromising JSON envelope behavior.

This does not complete the deferred `slot gt exec stack-map-branches` row, the OS-coupled row's required real-shell parity check, distribution cutover, Python fallback retirement, or umbrella playbook feedback.

## Follow-Ups

- Keep diagnostics slot-local for now; revisit a shared `@asdl/core` command diagnostic wrapper only if another package proves the same need.
- Use `ASDL_SLOT_DIAGNOSTIC_LOG` for future `slot gc` or gateway fanout investigations so JSON stdout remains reserved for command output.
- Continue to treat real GitHub PR-closing behavior as fake-backed validation unless a deliberate manual/throwaway real-PR check is separately approved.
