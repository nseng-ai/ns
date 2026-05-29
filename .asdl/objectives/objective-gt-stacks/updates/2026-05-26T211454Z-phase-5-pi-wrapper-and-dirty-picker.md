# Phase 5 Pi Wrapper and Dirty Picker Implemented

## Summary

Completed the remaining Phase 5 repo-local Pi Objective extension work. `/objective-gt-stacks` is now registered as a separate display command that runs `objective gt stacks --format markdown` by default and delegates help to `objective gt stacks --help`. The extension owns the chat-display policy and rejects `--format`, `--json-schema`, unknown flags, and positional arguments before invoking the CLI.

The Objective picker suggestion flow now combines committed Objective diffs versus trunk with checkout-local dirty Objective paths collected via `git status --porcelain=v1 -z -- .asdl/objectives`. Dirty paths and committed diffs are unioned, inactive slugs are ignored, checkout-aware labels are used when dirty paths contribute, and multiple changed active Objectives still require explicit user selection.

Evidence: local branch diff against Graphite parent `add-objective-gt-stacks-cli`; changed files are limited to the Pi Objective extension source/tests and this Objective record. Verification: `cd ts/packages/pi-extensions && bun test && bun run check` passed; `git diff --check` passed before the Objective tracking edits.

## Objective Impact

Phase 5 is now complete. The Pi extension has the checkout-local `/objective-list` wrapper, the separate Graphite-stack `/objective-gt-stacks` wrapper, record-oriented picker labels, and changed-Objective suggestions that account for both committed Objective diffs and checkout-local dirty Objective files.

The earlier remaining Pi extension risks are de-risked: the wrapper is a thin CLI display adapter rather than a TypeScript stack-projection implementation, and dirty checkout-local Objective changes now participate in picker suggestions without changing the Python `objective list --format json` contract.

Phase 6 remains open for public Objective skill/docs language and any prompt-template documentation that should mention the completed `objective gt stacks` split.

## Follow-Ups

- Update public Objective skill/docs language for `objective gt stacks` in the Phase 6 docs slice.
- Keep the interactive Objective stack TUI parked until the JSON graph contract has enough real use.
