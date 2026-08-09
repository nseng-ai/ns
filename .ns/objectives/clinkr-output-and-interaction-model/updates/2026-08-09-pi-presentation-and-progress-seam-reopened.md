# Pi Presentation and Progress Seam Reopened

## Summary

Review of PR #4168 showed that invocation-local stdout/stderr capture is a safety improvement but not the final structured host abstraction. Pi does not expose live terminal streams: it buffers both channels, derives final severity and headless destination from exit code, and combines captured text into one completion presentation. On the demonstrated bounded path, stdout predominantly means primary durable command output, while stderr conflates auxiliary narration, transient progress, warnings, prompts, previews, and failures.

The smallest proposed structured presentation vocabulary is now primary result rendering (`renderResult`) plus unclassified auxiliary human text (`echo`), with final naming still open to an equally precise existing Clinkr-owned abstraction. Standalone adapters map those operations to stdout/stderr; Pi defers both in invocation-local capture; tests capture them locally. This does not introduce a semantic Response/event ontology, and it does not remove stdout/stderr from terminal adapters, subprocess results, raw-command byte sinks, or compatibility surfaces.

The review also found two progress defects. `flow changes`, `flow autobranch`, `flow autoslot`, and `flow generate-pr-inventory` still route textual `commandIo.phase()` messages through Pi's deferred stderr fallback. Structured-phase commands including `flow cp` can forward typed events to Pi's status renderer while Flow's terminal renderer also emits a settled phase frame into captured stderr. Finally, setting only `canEmitAnsi: false` may preserve inherited physical TTY capabilities that can still select an ambient in-place writer.

## Objective Impact

The Objective is reopened beyond the landed output-safety checkpoint. Its scope and completion criteria now distinguish structured presentation semantics from physical terminal stream names, require classification of touched writes, make structured progress host-owned in Pi, and require fully settled non-TTY capabilities. The roadmap adds bounded presentation-seam and progress-ownership work before end-to-end qualification.

Observed behavior motivating the change includes a successful Pi command rendering primary output together with stale transient progress:

```text
stdout:
Working tree is clean; no outstanding changes.

stderr:
Inspecting worktree…
```

Pi's captured stream distinction remains compatibility metadata for current usage-error detection, Flow submit recovery, traces, and completion hooks until the migration explicitly preserves or replaces each policy.

## Follow-Ups

- Implement and validate the bounded `renderResult`/`echo` presentation seam, choosing final names against the existing Clinkr output abstraction.
- Migrate the four identified textual-phase Flow commands to structured host progress.
- Ensure `flow cp`, `flow submit`, `flow land`, and `flow squash-stack` render progress only once in Pi.
- Replace inherited physical terminal capabilities in Pi with explicit settled non-TTY capabilities and prove no ambient process writer is selected.
- Preserve or structurally replace usage-error, submit-recovery, tracing, and completion-hook dependencies on captured output.
