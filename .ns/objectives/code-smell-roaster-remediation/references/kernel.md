# ts/packages/kernel -- code-smell findings

Source: automated code-smell-roaster sweep (see repo root `.sdl/reviews/code-smell-roaster.md`), adversarially verified. 3 confirmed finding(s) (1 high, 2 medium, 0 low).

Re-verify file paths and line numbers at pickup time -- the repo moves between the sweep and implementation.

## ts/packages/kernel/src

1. **Duplicated Code** (high) -- `ts/packages/kernel/src/cli.ts:177-205 and 321-347`
   - Roast: The exact 'resolve a candidate into a loaded command, bail on failure, rebuild commandInfos, then build the CLI context' dance is typed out twice in the same file instead of once.
   - Evidence: `prepareRun` (lines 177-205) and `handleCompletionResolverInvocation` (lines 321-347) both: pick `selectedCommandLoader`, call it on the candidate, check `!loadedSelectedCommand.ok` and emit the same error/return shape, destructure `command`/`source`/`path`, call `commandInfosForSelectedCommand` with the identical undefined-guarded object literal, then call `buildSdlCliContext` with the same option bag.
   - Smallest fix: Extract a single `resolveSelectedSdlCommand({ candidate, loader, stderr })` helper that returns the loaded command + updated commandInfos (or a handled-error result), and call it from both `prepareRun` and `handleCompletionResolverInvocation`.

2. **Duplicated Code** (medium) -- `ts/packages/kernel/src/extension-discovery.ts:139-185`
   - Roast: Three copy-pasted 'does this entry exist, build a command, else push a diagnostic' blocks for file/index.ts/index.js prove the loop body never got factored out.
   - Evidence: The `.ts` file branch, the `index.ts` branch, and the `index.js` branch each repeat `commandForDirectEntry({...}); if (command.ok) commands.push(command.command); else diagnostics.push(command.diagnostic);` with only `kind`/`name`/`entryPath` varying.
   - Smallest fix: Build a small ordered list of `{ kind, name, entryPath }` candidates (file match, then index.ts, then index.js) and run the existing `commandForDirectEntry` + push/diagnostic logic once over that list.

3. **Duplicated Code** (medium) -- `ts/packages/kernel/src/extension-registry.ts:159-168, 396-408, 555-565`
   - Roast: The same 'spread group/segments/groupDescription if present, then name/description/fullDescription' object literal is retyped three times in this file alone (and twice more in command-registry.ts), so the command-info field set can only ever be extended by hunting down every copy.
   - Evidence: `loadSdlCommandCatalog`'s `commandInfos:` mapper, `externalCandidateForLevel`, and `staticCommandInfo` all build the identical shape: `...(candidate.group === undefined ? {} : { group: candidate.group }), ...(candidate.segments === undefined ? {} : { segments: candidate.segments }), ...(candidate.groupDescription === undefined ? {} : { groupDescription: candidate.groupDescription }), name: candidate.name, description: candidate.description, fullDescription: candidate.fullDescription`.
   - Smallest fix: Add one `toCommandCliInfo(candidate): SdlCommandCliInfo` helper (alongside `commandInfoForLoadedCommand` in command-registry.ts) and call it from `loadSdlCommandCatalog`, `externalCandidateForLevel`, and `staticCommandInfo` instead of re-deriving the field set each time.
