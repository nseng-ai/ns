# Objective-Stack-Impl Execution Policy Rebaseline

## Summary

This update makes `handoff-capability-extension` intentionally executable by `objective-stack-impl` across the remaining Objective, as far as implementation evidence allows. The Objective now records concrete defaults for decisions that previously forced steer-first pauses:

- nested command-tree work should start from SDL's existing grouped-command manifest mechanics (`sdl.group: "handoff"`) and selected leaf loading;
- `@sdl/handoff/api` should be additive and lifecycle-oriented over gateway-injected Handoff Domain Core behavior;
- `sdl handoff create` should require an explicit validated `--slug`, read final Markdown from `--file` or stdin, refuse overwrite by default, and leave content/model-derived slugging to Pi/skills;
- `sdl handoff pickup` should mechanically return artifact content plus Handoff Summary / Handoff Technical Locator metadata, with no summarization, launch, session replacement, or automatic continuation;
- standalone `handoff` binary/shim cutover is direct-executable once parity evidence and call-site inventory are explicit in the preview.

## Objective Impact

`objective.md` now states that future `objective-stack-impl` sessions should try to execute the remaining Objective end-to-end, one reviewable Graphite slice at a time, after the normal preview/confirmation gate. The Runner Policy keeps hard stop conditions for compatibility-breaking storage changes, public Pi command renames, dynamic Pi mirroring, public SDL SDK author API additions, agent-resource installation scope, automatic pickup continuation, real Branch Memory validation mutations, and external writes.

`roadmap.md` now marks the remaining design-sensitive rows as direct-executable under those defaults rather than steer-first by default. The remaining work is still reviewably sliced, but ordinary implementation should not need to stop for product/design input unless evidence contradicts the recorded defaults.

## Follow-Ups

- Future `objective-stack-impl` runs should cite this update and `updates/2026-06-27T230253Z-handoff-surface-inventory-baseline.md` in their preview.
- If implementation evidence proves a default insufficient, create a new Semantic Update explaining the exception and the new stop/decision point instead of silently changing compatibility or public API behavior.
- Before standalone CLI removal, rerun the inventory searches from the baseline update and record the parity/call-site evidence in a new update.
