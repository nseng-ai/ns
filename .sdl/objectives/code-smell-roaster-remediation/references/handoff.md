# ts/packages/handoff -- code-smell findings

Source: automated code-smell-roaster sweep (see repo root `.sdl/reviews/code-smell-roaster.md`), adversarially verified. 4 confirmed finding(s) (0 high, 2 medium, 2 low).

Re-verify file paths and line numbers at pickup time -- the repo moves between the sweep and implementation.

## ts/packages/handoff/src

1. **Middle Man** (medium) -- `ts/packages/handoff/src/operations/destructive-presentation.ts:1-18`
   - Roast: This whole file exists to rename one type and forward two arguments to a function that already does exactly this.
   - Evidence: `HandoffDestructiveResultBlock` is structurally identical to `cli-theme`'s `DestructiveResultBlock` (same `kind`/`headline`/`body?`/`guidance?` fields), and `renderHandoffDestructiveResultBlock(caps, input)` does nothing but `return renderDestructiveResultBlock(caps, input)` with no handoff-specific logic added.
   - Smallest fix: Delete the wrapper and `HandoffDestructiveResultBlock`/`HandoffDestructiveResultKind` aliases; have callers (delete.ts, gc.ts) import and call `renderDestructiveResultBlock`/`DestructiveResultBlock` from `@sdl/cli-theme` directly.

2. **Repeated Switches** (medium) -- `ts/packages/handoff/src/operations/gc.ts:15-26`
   - Roast: Every garbage-collection action gets its own private parallel universe: a type union, a count switch, a value map, an enum, a filter, and a label switch, scattered across two files, all of which must move together or silently drift.
   - Evidence: The 4-way `DeletedBranchGarbageCollectionAction` is independently re-enumerated in `gc-core.ts`'s `countEntries` switch (lines 111-126), then again here via `GC_ACTION_VALUE_BY_ACTION` (15-20), `gcActionSchema` (21-26), the inline `candidates` filter in `renderGc` (98-101), and `formatGcAction`'s switch (177-188).
   - Smallest fix: Define one ordered table of `{action, wireValue, label, isCandidate}` records and derive the schema, value map, filter predicate, and label lookup from it in a single place instead of five.

3. **Duplicated Code** (low) -- `ts/packages/handoff/src/operations/gc.ts:71-91`
   - Roast: Two operations independently reinvent the same 'gate, prompt, handle abort' confirmation ritual instead of sharing it.
   - Evidence: `runGc` (gc.ts:71-91) and `runDelete` (delete.ts:40-53) both call `requireInteractiveOrUsageError`, then `ctx.interaction.confirm(...)`, then branch on `confirmed.type === "aborted"` returning `failure("aborted", "Aborted!")` -- the same destructive-confirmation shape duplicated with only the messages and the non-aborted branch differing.
   - Smallest fix: Extract a shared `confirmDestructiveAction(ctx, { gateMessage, missingFlag, howToSupply, confirmMessage })` helper in operations/shared.ts that returns a `confirmed | declined | aborted | gateFailure` result, and call it from both runDelete and runGc.

4. **Duplicated Code** (low) -- `ts/packages/handoff/src/sdl/context.ts:49-59`
   - Roast: This function hand-rolls the exact optional-field-spreading dance the codebase already named and extracted, so it's a stale carbon copy of a pattern other call sites use a one-line helper for.
   - Evidence: return {
     ...(overrides.brmem === undefined ? {} : { brmem: overrides.brmem }),
     ...(overrides.git === undefined ? {} : { git: overrides.git }),
     ...(overrides.sourceReader === undefined ? {} : { sourceReader: overrides.sourceReader }),
     ...(overrides.interaction === undefined ? {} : { interaction: overrides.interaction }),
     };
   - Smallest fix: Import optionalEntry from @sdl/core/primitives (already used in ts/packages/handoff/src/operations/list.ts) and replace each ternary spread with ...optionalEntry("brmem", overrides.brmem), etc.
