# Worktree Status Render and Status Refactor

## Summary

Remediated the `worktree-status` code-smell cluster by centralizing three repeated structural shapes in `ts/packages/worktree-status`:

- `types.ts` now exports the canonical renderer contracts (`CustomMessage`, `RenderTheme`, `RenderComponent`, and `WorktreeStatusMessageRenderer`), and `status.ts` / `extension.ts` import those contracts instead of redeclaring them.
- `status.ts` now exports `formatGtCommitStatus(commits, "full" | "compact")`, so full status rendering and compact footer rendering share the single `GtCommitStatus` variant switch while preserving previous output strings.
- `status.ts` now names the shared GitHub PR-detail field group as `GhPrDetails`, and both available and head-mismatch GitHub status variants extend that shape.

Validation passed: `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just ts-test`.

## Objective Impact

The three `references/worktree-status.md` findings are now dispositioned as fixed in `roadmap.md`:

- Repeated Switches in `status.ts` / `footer-format.ts`: fixed by the shared `formatGtCommitStatus` style formatter.
- Duplicated Code in renderer contracts: fixed by exporting/importing the shared contracts from `types.ts`.
- Data Clumps in GitHub PR status details: fixed by the shared `GhPrDetails` type.

This reduces the open, no-disposition finding count by 3 without changing worktree-status behavior.

## Follow-Ups

No worktree-status follow-up is known. Future status-rendering additions should extend the shared renderer contracts and commit-status formatter rather than reintroducing local variants.
