# ts/packages/sdl-capability-kit -- code-smell findings

Source: automated code-smell-roaster sweep (see repo root `.sdl/reviews/code-smell-roaster.md`), adversarially verified. 3 confirmed finding(s) (1 high, 1 medium, 1 low).

Re-verify file paths and line numbers at pickup time -- the repo moves between the sweep and implementation.

## ts/packages/sdl-capability-kit/src

1. **Duplicated Code** (high) -- `ts/packages/sdl-capability-kit/src/text-generation-testing.ts:4-24`
   - Roast: The testing module hand-copies the entire production text-generation contract instead of importing it, so the fake and the real interface are one rename away from silently drifting apart.
   - Evidence: text-generation-testing.ts re-declares `TextGenerationRequest`, `TextGenerationUsage`, `TextGenerationResult`, and `TextGenerator` verbatim, field-for-field identical to the definitions already exported from ./text-generation.ts (lines 3-23 there) -- text-repair.ts even imports the real one (`import type { TextGenerationResult } from "./text-generation.ts";`) while the testing file does not.
   - Smallest fix: Delete the duplicated interfaces in text-generation-testing.ts and `import type { TextGenerationRequest, TextGenerationUsage, TextGenerationResult, TextGenerator } from "./text-generation.ts"` instead.

2. **Duplicated Code** (medium) -- `ts/packages/sdl-capability-kit/src/checkpoint-flow.ts:51-56`
   - Roast: Two files in the same package each reinvent the exact same four-field shell-result shape under a different name instead of using the ExecResult type this very package already imports elsewhere.
   - Evidence: checkpoint-flow.ts: `export interface CommandResult { code: number; stdout: string; stderr: string; killed?: boolean; }` is byte-for-byte the same shape as pending-worktree.ts's `WorktreeCommandResult` (lines 5-10 there), while gateway-result.ts and brmem-cli.ts already use the shared `ExecResult` from @sdl/exec / @sdl/core/command for the identical concept.
   - Smallest fix: Replace both local CommandResult/WorktreeCommandResult interfaces with the shared ExecResult type (or a single re-exported alias), and have both modules' exec callbacks return that.

3. **Data Clumps** (low) -- `ts/packages/sdl-capability-kit/src/brmem-cli.ts:68-154`
   - Roast: The same five-field travel party -- gateway, cwd, timeoutMs, env, signal -- gets re-typed from scratch in six different option interfaces instead of being bundled once and extended.
   - Evidence: RunBrmemOptions (68-75), RunAvailableBrmemCommandOptions (87-94), CheckBrmemEntryOptions (122-127), PutBrmemEntryFromFileOptions (134-144), and ListBrmemEntriesOptions (146-154) each redeclare `gateway: BrmemExecGateway; cwd: string; timeoutMs?: number; env?: ...; signal?: ...` independently.
   - Smallest fix: Extract a shared `BrmemCallContext { gateway; cwd; timeoutMs?; env?; signal? }` base interface and have each options type `extends` it, the way CheckBrmemEntryOptions already extends BrmemEntryLocator for its own clump.
