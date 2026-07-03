# Changes Hard Cutover

## Summary

The read-only pending-worktree inspection slice has moved from the Pi-only `/code:changes` surface to SDL. Evidence: local working-tree diff against Graphite parent `sdl-submit-built-in-registry-runtime-hooks` adds built-in `sdl changes`, SDL-owned changes summary/model-summary helpers, command registry metadata, and SDL CLI scenario coverage for clean worktrees, dirty model summaries, git/model failures, help/schema metadata, model environment selection, and display caps.

The Pi surface now registers `/sdl:changes` through the generic SDL CLI bridge. The old Pi-only `changes.ts`, `changes-summary.ts`, `changes-model-summary.ts`, custom `code-changes-summary` renderer, and Pi-specific changes tests were removed. Pi registration, parity metadata, docs, and context now describe `sdl changes` / `/sdl:changes` as the durable surface, with remaining `/code:changes` hits limited to no-alias migration notes or absence assertions.

Validation evidence: targeted SDL package check/test passed; targeted Pi extension package check/test passed; full TypeScript check/test passed; `just dprint-check` passed after dprint autofix.

## Objective Impact

The roadmap row “Migrate read-only worktree inspection from `/code:changes` to SDL” is complete. This advances the hard-cutover pattern established by `submit`: SDL owns the durable lifecycle command, Pi is only a thin mirror, and the old `/code:*` surface is removed in the same slice rather than retained as a compatibility alias.

The broader stale-vocabulary cleanup row remains open because future slices still need to migrate or disposition `autobranch`, `autoslot`, landing/push, PR metadata, and review-feedback surfaces. The Objective remains open.

## Follow-Ups

- Continue command-specific source-search gates in later migration slices so old `/code:*` and `asdl-dev` names do not remain as active guidance.
- Migrate `autobranch` and `autoslot` next only with the same hard-cutover discipline and safety coverage for real branch/slot mutations.
- Keep `pr-regen` deferred until the SDL review/metadata taxonomy decision lands.
