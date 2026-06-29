# Roadmap

## Work

- [ ] Clean result-block and presentation-model boundaries.
  Tighten `@sdl/cli-theme` result block inputs and local Flow/CCC/slot/handoff facades so optional body/guidance/cwd fields are omitted when absent rather than accepting explicit `undefined`. Evidence: callsites either pass definite strings or normalize before constructing render inputs.

- [ ] Clean Flow submit transcript/result models.
  Remove explicit-undefined acceptance from submit failure transcripts and command results where construction already uses conditional omission. Preserve `ExecResult` boundary compatibility only at the adapter edge.

- [ ] Normalize SDLCC stack-map internal collections.
  Decide and implement whether branch tree collections such as `children`, `slots`, and `cmuxTabs` should be required arrays after model loading. Remove downstream `?? []` handling that only compensates for unnormalized builders.

- [ ] Normalize PR feedback watch state and event models.
  Separate external GitHub/REST/JSON parsing from internal watch status, fingerprint, snapshot, and event shapes. Ensure absent fields are omitted or represented by explicit state before internal consumers build prompts, logs, and notifications.

- [ ] Clean small internally constructed diagnostics/result models.
  Inspect kernel command/extension diagnostics, areg replacement info, packagechk results, and check-count `hasMore` models. Tighten only where construction can normalize at the source without harming public input or external payload compatibility.

- [ ] Rebaseline candidate inventory and preserved/deferred rationale.
  Summarize before/after counts, remaining compatibility categories, null-union caution cases, and deferred ambiguous surfaces in Objective updates or implementation summaries. Evidence: remaining candidates are mostly true input/override/config/external/test-builder surfaces or explicitly explained exceptions.

## Parked

- [ ] Consider a future advisory-tool metadata improvement if repeated manual classification remains costly.
  This is parked unless implementation shows that a non-failing helper would materially improve future cleanup without creating an allowlist or hard ban.
