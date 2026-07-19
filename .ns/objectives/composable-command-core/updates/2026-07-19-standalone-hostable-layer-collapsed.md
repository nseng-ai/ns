# Semantic Update: standalone hostable layer collapsed

## Summary

The Objective's explicit collapse trigger fired. The public composable execution model is now raw or clinkr; there is no independently branded `hostable(...)` run.

The `flow cp` steel thread supplied the decisive evidence: clinkr was the only executable composable shape. Descriptor validation and CLI routing required clinkr metadata, while the standalone hostable brand had no parser, request/result mounting contract, completion behavior, or current non-clinkr consumer. Keeping the brand would advertise an execution mode the runtime could not load or execute.

## Decision

- Delete the public `hostable(...)`, `HostableRun`, hostable brand, and guard.
- Brand `ClinkrRun` directly with its clinkr specification.
- Keep the event and interaction contracts required by clinkr handlers as clinkr-owned SDK conversation plumbing, not as a second executable layer.
- Validate composable descriptors by requiring clinkr metadata; arbitrary branded composable callables are rejected explicitly.
- Reintroduce a separate execution tier only when a concrete non-clinkr consumer supplies a settled parser/request/result and hosting contract.

This correction is intentionally breaking: the new command subpath is private and unreleased. Legacy `NsExtensionApi`, including its `onOutput` compatibility surface, remains outside this decision.

## Objective Impact

`objective.md` and `roadmap.md` now describe the raw-or-clinkr model and remove the migration-verdict dependency for deciding whether standalone hostability earned its keep. The chat-seam investigation remains useful evidence for clinkr's event/interaction bundle and future Pi rendering; it no longer implies a public executable middle tier.

Completion behavior and the default events-to-terminal renderer remain separate follow-up slices. The transitional clinkr-bundle `onOutput` field used by `flow cp` is not removed by this update.
