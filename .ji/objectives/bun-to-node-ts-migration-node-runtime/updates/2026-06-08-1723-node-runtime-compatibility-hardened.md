# Node runtime compatibility hardened

## Summary

The Node runtime compatibility slice is implemented for active project-local TypeScript surfaces. `asdl-dev` and `planned-branch` now use Node shebangs while retaining source `.ts` bin targets, `tsconfig.json` enforces `erasableSyntaxOnly`, and checked-in smoke tests spawn Node directly for CLI entrypoints, project-local Pi extension adapters, and representative workspace package imports.

The active Vercel command fallback moved from `bunx vercel@latest` to `pnpm dlx vercel@latest`. The Graphite metadata reader policy is reaffirmed as the existing external `sqlite3` CLI adapter: local evidence found `sqlite3` available, while `node:sqlite` still emits an experimental warning, so replacement would add warning-policy risk without solving a concrete runtime incompatibility.

## Objective Impact

All non-parked roadmap rows for this Objective are complete. The supported runtime path remains Node v24.12+ native TypeScript type stripping with explicit `.ts` imports and no build-to-JavaScript artifacts. Remaining Bun-shaped hits in scoped inventory are classified as generic runner safety logic, active guidance that forbids Bun tests, or broad cleanup for the separate Bun-reference reconciliation Objective.

Validation evidence: Node v24.12.0 direct CLI and import smokes passed; `pnpm --dir ts run check`, `pnpm --dir ts run test`, `just ts-test`, targeted package suites, and `just dprint-check` passed.

## Follow-Ups

- Keep published-package and non-workspace install guarantees parked until the repository chooses to support that distribution mode.
- Leave broad historical/template/prose Bun-reference cleanup to the separate Bun-reference reconciliation Objective.
- Keep `sqlite3` CLI availability as the Graphite metadata adapter policy unless future evidence shows a concrete runtime incompatibility.
