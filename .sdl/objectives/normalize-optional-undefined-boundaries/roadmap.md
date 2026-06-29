# Roadmap

## Work

- [x] Clean result-block and presentation-model boundaries.
      Tighten `@sdl/cli-theme` result block inputs and local Flow/CCC/slot/handoff facades so optional body/guidance/cwd fields are omitted when absent rather than accepting explicit `undefined`. Evidence: Flow git result block and clinkr terminal render capability construction already omitted absent optional values; `@sdl/cli-theme` result-block inputs plus direct Flow/CCC/slot/handoff facades now use omission-only `body`/`guidance`/`cwd`, and slot destructive render callsites omit absent detail bodies.

- [x] Clean Flow submit transcript/result models.
      Remove explicit-undefined acceptance from submit failure transcripts and command results where construction already uses conditional omission. Preserve `ExecResult` boundary compatibility only at the adapter edge. Evidence: Flow submit's merged-PR-not-in-trunk detail model and git result transcript facade were tightened; the full Flow package pass then tightened submit semantic failure causes, failure transcript commands/summaries, failed result causes, command result metadata, and failure helper options, with construction adapted to omit absent branch names.

- [ ] Normalize SDLCC stack-map internal collections.
      Decide and implement whether branch tree collections such as `children`, `slots`, and `cmuxTabs` should be required arrays after model loading. Remove downstream `?? []` handling that only compensates for unnormalized builders.

- [ ] Normalize PR feedback watch state and event models.
      Separate external GitHub/REST/JSON parsing from internal watch status, fingerprint, snapshot, and event shapes. Ensure absent fields are omitted or represented by explicit state before internal consumers build prompts, logs, and notifications.

- [~] Clean small internally constructed diagnostics/result models.
  Inspect kernel command/extension diagnostics, areg replacement info, packagechk results, and check-count `hasMore` models. Tighten only where construction can normalize at the source without harming public input or external payload compatibility. Evidence: selected address, aretro, branch-context, slot fake, core git fake, graphite fake, worktree-status, and kernel/clinkr integration shapes were tightened; kernel command/extension diagnostics, packagechk, areg replacement info, and check-count remain to classify.

- [~] Rebaseline candidate inventory and preserved/deferred rationale.
  Summarize before/after counts, remaining compatibility categories, null-union caution cases, and deferred ambiguous surfaces in Objective updates or implementation summaries. Evidence: advisory audit support and review guidance now exist; the shared result-block presentation slice recorded a selected-slice reduction from 20 to 0 `?: T | undefined` hits across the primary result-block/facade files. The Flow package pass reduced `ts/packages/capabilities/flow/src` from the planning inventory of 28 optional-undefined candidates to 2 preserved process-environment matches (`Record<string, string | undefined>`), with Flow-owned submit, presentation, and option/input surfaces tightened.

## Parked

- [ ] Consider a future advisory-tool metadata improvement if repeated manual classification remains costly.
      This is parked unless implementation shows that a non-failing helper would materially improve future cleanup without creating an allowlist or hard ban.
