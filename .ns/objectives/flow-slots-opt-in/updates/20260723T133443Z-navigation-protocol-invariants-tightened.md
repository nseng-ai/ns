# Navigation Protocol Invariants Tightened

## Summary

Open PR #3830 (`slots-foreach-output-navigation-invariants`) tightens the autoslot command boundary established by the delivered decoupling slice. Slots now centralizes the stable flat parent-shell directive fields as a status-discriminated navigation schema, composes that schema into checkout, goto, and Graphite navigation results, and maps directive write outcomes exhaustively. Flow mirrors the same legal combinations at its external `ns slot checkout --format json` boundary, rejects malformed combinations as invalid envelopes, and no longer manufactures fallback path or failure detail for an impossible failed state.

The same change threads the host-selected output format into Slot command contexts and makes `slot foreach` require `--yes` for every non-human output format, including JSON and Markdown, without consulting directive-writing capability or prompting interactively.

Focused Slots and Flow tests, `just ts-check`, formatting, lint, the isolated lane, `git diff --check`, and the full `just` suite passed on the implementing branch.

## Objective Impact

This follow-up hardens the completed autoslot decoupling row rather than opening a new roadmap slice. The CLI boundary now has coherent runtime and static navigation evidence on both producer and consumer sides, preserving Flow's package independence while ensuring a valid failed directive outcome always carries the path and detail needed for the existing non-fatal warning.

PR evidence:

- PR #3830: Tighten slot navigation contracts and non-human `foreach` confirmation — open follow-up that enforces the Slots/Flow wire invariant and removes impossible-state fallback behavior.

The Objective remains open: invocation-time Slots presence and explicit land degradation are still the next undelivered semantic slice, followed by README/code-adjacent contract alignment.

## Follow-Ups

- Implement the land degradation roadmap row using exact invocation-time `hasExtension("@nseng-ai/slots")` evidence.
- Align Flow's README and code-adjacent guidance after the land behavior is delivered.
- Carry the completed Flow relationship and PR evidence into `slots-consumer-dependency-contracts` synthesis when that linked Objective is updated.
