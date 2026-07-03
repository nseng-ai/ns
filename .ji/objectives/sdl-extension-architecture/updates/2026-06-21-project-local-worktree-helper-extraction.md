# Project-local Worktree Helper Extraction

## Summary

PR #2016 / branch `refactor-worktree-helpers` extracts the repeated worktree-git helper seam into `.sdl/extensions/shared/worktree.ts`. The shared helper is consumed by `.sdl/extensions/changes.ts`, `.sdl/extensions/cp.ts`, and `.sdl/extensions/autobranch.ts` for pending-worktree snapshot loading, git execution wrappers, environment fallback lookup, command detail/error formatting, and checkpoint commit creation.

The slice keeps extension modules on the public SDL author boundary: SDL imports remain through `@sdl/sdl/sdk`, and the helper lives inside the project-local `.sdl/extensions/` ownership boundary instead of becoming a public SDK or kernel service.

## Objective Impact

This records a middle-tier architecture result from the command-first experiment. Repeated command-local duplication does not need to jump directly into `@sdl/sdl/sdk`; when multiple project-local commands prove the seam and local extraction keeps authoring readable, extension-owned shared helpers can de-risk duplication while preserving the higher bar for public SDK promotion.

The update partially de-risks the earlier concern that SDL extensions would either duplicate all worktree logic or overfit the public SDK with convenience helpers. It does not complete the `regenerate-pr` migration, dynamic Pi mirror design, or the final command-first closure-boundary decision.

## Follow-Ups

- Keep the worktree helper as project-local architecture evidence unless later command slices show it should become a public Git/worktree SDK capability.
- Continue using `regenerate-pr` to test GitHub-facing seams separately from the worktree-git helper seam.
- At closure, distinguish project-local shared helper success from any decision about future bundled extensions or sophisticated workflow migrations.
