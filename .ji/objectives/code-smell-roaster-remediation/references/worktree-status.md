# ts/packages/worktree-status -- code-smell findings

Source: automated code-smell-roaster sweep (see repo root `.sdl/reviews/code-smell-roaster.md`), adversarially verified. 3 confirmed finding(s) (0 high, 2 medium, 1 low).

Re-verify file paths and line numbers at pickup time -- the repo moves between the sweep and implementation.

## ts/packages/worktree-status/src

1. **Repeated Switches** (medium) -- `ts/packages/worktree-status/src/status.ts:756-765`
   - Roast: GtCommitStatus gets exhaustively switched on twice in this module for the crime of printing a number two different ways, so every new commit-status variant means hunting down both copies.
   - Evidence: status.ts `formatGtCommitStatus` switches on `commits.type` ('count'/'unknown'/'not-applicable') to build the multi-line status text, and footer-format.ts `footerCommitCount` (lines 178-187) switches on the exact same `GtCommitStatus.type` to build the compact footer text ('?', '-', count.toString()).
   - Smallest fix: Replace both ad-hoc switches with one shared formatter (e.g. `formatGtCommitStatus(commits, { style: 'full' | 'compact' })` or a lookup map keyed by `commits.type`) that both call sites use, so a new variant is handled once.

2. **Duplicated Code** (medium) -- `ts/packages/worktree-status/src/types.ts:20-33`
   - Roast: The same three render-contract interfaces are hand-copied into three different files like nobody trusts `export` to actually export anything.
   - Evidence: `CustomMessage`, `RenderTheme`, and `RenderComponent` are each redefined verbatim (give or take a stray `display` field) in types.ts (20-33), status.ts (167-180), and extension.ts (168-189) instead of being declared once and imported.
   - Smallest fix: Declare `CustomMessage`/`RenderTheme`/`RenderComponent` once (e.g. in types.ts) and import them in status.ts and extension.ts instead of re-declaring locally.

3. **Data Clumps** (low) -- `ts/packages/worktree-status/src/status.ts:127-142`
   - Roast: GhStatus and GhHeadMismatchStatus drag the same four fields around together everywhere except their own declarations, which never bothered to share them.
   - Evidence: `GhStatus { type; prNumber; url?; threads; checks }` and `GhHeadMismatchStatus { type; prNumber; url?; threads; checks; prHeadOid }` repeat the identical prNumber/url/threads/checks quartet; `formatGhPrDetailPieces` (line 817) even has to fall back to `Pick<GhStatus, "prNumber" | "url" | "threads" | "checks">` to name that shared shape after the fact.
   - Smallest fix: Extract a `GhPrDetails { prNumber; url?; threads; checks }` type and have both `GhStatus` and `GhHeadMismatchStatus` extend/embed it instead of repeating the four fields.
