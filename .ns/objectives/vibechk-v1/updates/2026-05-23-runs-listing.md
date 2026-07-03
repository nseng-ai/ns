# Runs Listing

## Summary

`vibechk runs` now lists local run bundles from the configured store without creating a missing store. The command supports compact tabular output and JSON output, sorts bundles by most recent start time, preserves `null` metric values in machine-readable output, and reports empty stores as either `No vibechk runs found.` or `[]`.

Evidence: working-tree implementation on top of Graphite parent `implement-vibechk-run-show-diff-skeleton`. Verification: targeted `packages/vibechk` store and CLI tests passed; full `just check` passed.

## Objective Impact

The store-hardening roadmap row can now be marked complete: collision handling, prefix-resolution errors, store-root precedence, and `vibechk runs` tabular/JSON listing are covered. Unit tests cover missing stores, sorting, ignored non-directory children, and corrupt/incomplete bundle behavior. Scenario tests cover top-level help, empty-store behavior, table listing, JSON shape, newest-first ordering, branch/model/workdir fields, and null metrics.

The broader fake-driven coverage row remains partial because runner parity, publish idempotency, and remaining runner/publish hardening are still future v1 work.

## Follow-Ups

- Add remaining runner adapters and normalization coverage for `claude`, `codex`, and `pi`.
- Implement GitHub PR publishing and branch-on-remote validation through `gh`.
- Run and record the required real GitHub PR publish smoke before closing v1.
