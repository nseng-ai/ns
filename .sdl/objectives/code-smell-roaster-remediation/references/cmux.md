# ts/packages/cmux -- code-smell findings

Source: automated code-smell-roaster sweep (see repo root `.sdl/reviews/code-smell-roaster.md`), adversarially verified. 3 confirmed finding(s) (1 high, 2 medium, 0 low).

Re-verify file paths and line numbers at pickup time -- the repo moves between the sweep and implementation.

## ts/packages/cmux/src

1. **Speculative Generality** (high) -- `ts/packages/cmux/src/focused-terminal-tab.ts:51-98`
   - Roast: Three exported 'building block' functions duplicate the real orchestration in launchFocusedCmuxTab and nobody outside this file ever calls them.
   - Evidence: createCmuxSurface, renameCmuxTab, and sendCmuxText each spin up their own RealCmuxGateway and re-implement the exact gateway call + error-mapping that launchFocusedCmuxTab (lines 116-182) already does inline. A repo-wide grep shows only identifyCmuxCaller is imported anywhere outside this package (ts/packages/capability-pi/handoff/src/tab.ts); createCmuxSurface/renameCmuxTab/sendCmuxText have zero callers beyond their own re-export in index.ts.
   - Smallest fix: Delete the unused createCmuxSurface, renameCmuxTab, and sendCmuxText exports (and their index.ts re-exports) until a real caller needs single-stage access; keep launchFocusedCmuxTab as the one orchestration entry point.

2. **Data Clumps** (medium) -- `ts/packages/cmux/src/focused-terminal-tab.ts:16-30`
   - Roast: workspaceId/surfaceId/windowId travel together as a trio through four separate interfaces instead of being named once as the surface reference they represent.
   - Evidence: CmuxTabOptions (16-22) and CmuxSendOptions (24-30) both carry `workspaceId`, `surfaceId`, `windowId?`; gateway.ts's RenameCmuxTabParams (67-72) and SendCmuxTextParams (74-79) repeat the same trio again.
   - Smallest fix: Introduce a single CmuxSurfaceRef { workspaceId; surfaceId; windowId? } type and embed it in CmuxTabOptions, CmuxSendOptions, RenameCmuxTabParams, and SendCmuxTextParams instead of repeating the three fields.

3. **Duplicated Code** (medium) -- `ts/packages/cmux/src/pi-launch.ts:3-8`
   - Roast: The package defines the model/thinking-level vocabulary twice with different names so the two copies can quietly drift apart.
   - Evidence: pi-launch.ts declares `PiLaunchThinkingLevel = "off"|"minimal"|"low"|"medium"|"high"|"xhigh"` and `PiLaunchModelInfo {provider; id}`, which are character-for-character the same shapes as `ThinkingLevel` (types.ts:6) and `ModelInfo` (types.ts:8-11) in the same package.
   - Smallest fix: Import and reuse ModelInfo/ThinkingLevel from types.ts in pi-launch.ts instead of re-declaring equivalent types under new names.
