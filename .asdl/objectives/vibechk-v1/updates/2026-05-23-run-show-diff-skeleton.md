# Run Show Diff Skeleton

## Summary

The thin `vibechk run -> vibechk show -> vibechk diff` walking skeleton now exists. `run` accepts a plan, clean git workdir, runner/model/store options, creates an 8-character run bundle, snapshots the plan, captures transcript and diff files, persists stable metadata with `null` metrics, commits workdir changes to local `vibechk/<run-id>` branches, restores the starting branch, and preserves failed-runner bundles. `show` and `diff` resolve unique run-id prefixes and render stable Markdown reports for single runs and comparisons.

Evidence: working-tree implementation on top of Graphite parent `prioritize-vibechk-walking-skeleton-first-run-show`. Verification: targeted `packages/vibechk` tests passed; full `just check` passed.

## Objective Impact

The roadmap can now treat the first comparison loop as landed rather than planned. The skeleton also completes the minimal bundle store/run-id support, runner contract plus first `claude` subprocess adapter and fake seam, git provenance/branch behavior, and pasteable Markdown report surface needed for the first local comparison.

Store hardening and coverage are only partially complete: collision handling, prefix errors, and store precedence are covered, but `vibechk runs`, full runner parity/normalization, `publish`, and live GitHub smoke evidence remain future v1 work.

## Follow-Ups

- Implement `vibechk runs` tabular/JSON listing on top of the existing local store.
- Add `codex` and `pi` runner adapters plus per-runner metric normalization coverage.
- Implement GitHub PR publishing, branch-on-remote validation, and idempotent fence replacement through `gh`.
- Harden rollback/error behavior around result-branch creation failures.
