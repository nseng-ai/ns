# Roadmap

## Work

- [x] Clean result-block and presentation-model boundaries.
      Tighten `@sdl/cli-theme` result block inputs and local Flow/CCC/slot/handoff facades so optional body/guidance/cwd fields are omitted when absent rather than accepting explicit `undefined`. Evidence: Flow git result block and clinkr terminal render capability construction already omitted absent optional values; `@sdl/cli-theme` result-block inputs plus direct Flow/CCC/slot/handoff facades now use omission-only `body`/`guidance`/`cwd`, and slot destructive render callsites omit absent detail bodies.

- [x] Clean Flow submit transcript/result models.
      Remove explicit-undefined acceptance from submit failure transcripts and command results where construction already uses conditional omission. Preserve `ExecResult` boundary compatibility only at the adapter edge. Evidence: Flow submit's merged-PR-not-in-trunk detail model and git result transcript facade were tightened; the full Flow package pass then tightened submit semantic failure causes, failure transcript commands/summaries, failed result causes, command result metadata, and failure helper options, with construction adapted to omit absent branch names.

- [x] Normalize SDLCC stack-map internal collections.
      Decide and implement whether branch tree collections such as `children`, `slots`, and `cmuxTabs` should be required arrays after model loading. Remove downstream `?? []` handling that only compensates for unnormalized builders. Evidence: PR #2391 / branch diff `flow-optional-undefined-boundary-pass...HEAD` makes `StackMapBranchNode` require `children`, `slots`, and `cmuxTabs`, initializes empty arrays in graph/unavailable builders, removes downstream branch-collection fallbacks, and updates SDLCC tests for the normalized shape.

- [x] Normalize PR feedback watch state and event models.
      Separate external GitHub/REST/JSON parsing from internal watch status, fingerprint, snapshot, and event shapes. Ensure absent fields are omitted or represented by explicit state before internal consumers build prompts, logs, and notifications. Evidence: PR #2396 / branch diff `normalize-stack-map-branch-collections...HEAD` tightens PR feedback watch models to omission-only optional fields, normalizes fingerprint/snapshot/status/event construction, strict-drops malformed restore-relevant watch events, and preserves gateway/input compatibility fields.

- [~] Clean small internally constructed diagnostics/result models.
  Inspect kernel command/extension diagnostics, areg replacement info, packagechk results, and check-count `hasMore` models. Tighten only where construction can normalize at the source without harming public input or external payload compatibility. Evidence: selected address, aretro, branch-context, slot fake, core git fake, graphite fake, worktree-status, and kernel/clinkr integration shapes were tightened; packagechk result metadata was tightened from 3 to 0 targeted `?: T | undefined` fields while preserving parser/schema/options boundaries; kernel command/extension diagnostics, areg replacement info, and check-count remain to classify.

- [~] Rebaseline candidate inventory and preserved/deferred rationale.
  Summarize before/after counts, remaining compatibility categories, null-union caution cases, and deferred ambiguous surfaces in Objective updates or implementation summaries. Evidence: advisory audit support and review guidance now exist; the shared result-block presentation slice recorded a selected-slice reduction from 20 to 0 `?: T | undefined` hits across the primary result-block/facade files. The Flow package pass reduced `ts/packages/capabilities/flow/src` from the planning inventory of 28 optional-undefined candidates to 2 preserved process-environment matches (`Record<string, string | undefined>`), with Flow-owned submit, presentation, and option/input surfaces tightened. The SDLCC stack-map slice removed the three optional internal collection fields and downstream branch-collection compensation while preserving loader option/input surfaces such as parsed cmux tab options. The PR feedback watch slice reduced `model.ts` from 25 to 0 candidates and the broader watch source/test slice from 35 to 7, preserving only UI status-clearing and GitHub REST/options/query boundary fields. The packagechk slice reduced targeted `RegistryCheckResult` metadata fields from 3 to 0 and preserved parser helper, CLI/Zod schema, and test/options bag boundaries.

## Parked

- [ ] Consider a future advisory-tool metadata improvement if repeated manual classification remains costly.
      This is parked unless implementation shows that a non-failing helper would materially improve future cleanup without creating an allowlist or hard ban.
