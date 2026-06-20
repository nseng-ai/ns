# Terminal Capture Runtime Added

## Summary

The third implementation slice adds the injected child terminal-capture runtime for `runChildSession` under `ts/packages/pi-extensions`.

The runner now creates private runtime files for each child run: a JSON config containing the requested terminal tools, a result sink, and a generated runtime extension shim. Child Pi launches use `--mode json -p --no-extensions --extension <runtime-shim> --session <file>`, keeping parent-facing extensions out of ordinary child runs while explicitly loading the terminal runtime.

The child runtime registers capture-only terminal tools from the supplied definitions, checks startup collisions against tools visible through `pi.getAllTools()`, writes the first terminal capture or runtime error to the result sink, requests termination after a valid capture, and blocks later non-terminal tool calls once a terminal capture has been recorded. The parent runner reads the result sink and maps terminal captures to `completed` or `blocked`, runtime startup failures to `error`, and malformed/missing captures after terminal attempts to `protocol-error`.

The JSON event parser also detects terminal tools mixed with sibling tool calls in the same turn and reports `protocol-error`. This is detect-and-report under public Pi extension events: an earlier sibling tool may already have run before the violation is observable.

Evidence: local branch diff against Graphite parent `add-jsonl-child-session-runner`; PR #556 corroborates the same file set and commit. Verification: targeted Bun contract/runtime/parser/runner/terminal-tool tests passed, and the `@asdl/pi-extensions` TypeScript check passed. No real provider/model calls were required.

## Objective Impact

PR 3 is materially complete for the injected child runtime extension, terminal tool config/result transport, generated runtime extension shim, capture-only terminal tools, terminal result mapping, collision startup failures, terminal execution errors, and mixed terminal-plus-sibling protocol detection.

The Objective now records two narrowed design decisions:

- Child terminal-capture runs use `--no-extensions` plus an explicit generated runtime extension by default, rather than loading ordinary project extensions and relying on child environment guards.
- Terminal runtime configuration uses a private temp config file, generated extension shim, and first-writer-wins result sink for the MVP.

The mixed terminal-plus-sibling open question is narrowed but not eliminated: the extension-layer MVP deterministically reports the protocol violation, while exact no-side-effect prevention remains a limitation unless a first consumer proves a Pi core hook is required.

First-consumer wiring, parent UI/progress presentation, regression coverage against slash-command handoff text, and user-facing documentation remain PR 4 work.

## Follow-Ups

- Implement PR 4 parent integration, docs, UI/progress presentation, and first-consumer proof.
- Decide whether the first consumer needs ordinary child-extension allowlisting beyond the current `--no-extensions` terminal-runtime launch.
- Run a real/manual child-session smoke when a parent-facing consumer or diagnostic harness exists.
- Revisit a Pi core hook only if a first consumer cannot accept detect-and-report mixed-tool protocol enforcement.
