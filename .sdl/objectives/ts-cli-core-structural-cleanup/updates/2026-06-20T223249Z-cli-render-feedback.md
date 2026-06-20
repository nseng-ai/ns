# CLI Render Feedback Follow-Up

## Summary

PR #1940 (`address-cli-render-feedback`) adjusts the shared CLI render path after the `plans` CLI migration work: `clinkr`'s `ok` exit now carries render overrides directly, and `plans list` / `plans resolve` return their human render text through the `ok` envelope instead of command-level render hooks.

## Objective Impact

This is progress on the shared `defineCli` wiring cleanup, specifically the behavior-preservation edge around human rendering for a migrated CLI. It does not complete the fleet-wide `defineCli` migration or its required scenario-test evidence, so the roadmap row moves to in-progress rather than complete.

## Follow-Ups

- Continue the fleet-wide `defineCli` migration and keep `--version`, `--runtime`, and `-h` scenario coverage as the durable behavior-parity evidence.
- Confirm remaining migrated CLIs use the same render-override path when they need custom human or Markdown output.
