# Bun Reference Inventory and Policy

## Summary

A scoped reconciliation audit classified the remaining Bun references across active repo guidance, TypeScript workspace files, project-local Pi extension surfaces, docs-site/deploy guidance, and relevant templates. The audit used the handoff search shape over `AGENTS.md`, `docs/`, `.github/`, `justfile`, `ts/`, `docs-site/`, `skills/`, and `.pi/extensions/`, then filtered substring noise such as `ubuntu-latest` and generic words like `bundled`.

Active TypeScript workspace scripts and configuration now align with Node + pnpm + Vitest: `ts/package.json` uses `pnpm@10.14.0`, Node `>=24.12.0`, and a Vitest root test script; package-local `ts/packages/*/package.json` test scripts invoke Vitest; `ts/tsconfig.json` uses only Node types; and GitHub Actions TypeScript/docs jobs use pnpm and Node without Bun setup.

Two stale active references were updated:

- `justfile` now describes the linked `planned-branch` CLI as using the Node shebang from workspace source instead of a transitional Bun shebang.
- `skills/code-gt-restack-resolve/SKILL.md` no longer grants `Bash(bun run *)` for restack conflict resolution.

The Bun-centric project creation template is intentionally retained as product guidance. `skills/create-bun-typescript-project/SKILL.md` now states that the skill is for users who want a Bun project and should not be treated as the default template for existing Node, pnpm, or Vitest workspaces, or migrations away from Bun.

Remaining accepted references are classified as follows:

- `AGENTS.md` is current active guidance: TypeScript workspace tests are pnpm/Vitest-backed, with direct Bun test guidance limited to out-of-scope standalone Bun projects.
- `skills/create-bun-typescript-project/**` is deliberate standalone Bun template/product guidance.
- `docs/internal-pr-stack-address-retrospective.md` and older Objective records are historical/provenance evidence and should not be churned merely to reduce search hits.
- `ts/packages/pi-extensions/src/runner-subagent/subagent-process.ts` keeps `node|bun` runtime detection and a `/$bunfs/root/` guard as compatibility/safety handling, not as an active Bun requirement.
- `.github/workflows/*` matches from the broad search were substring noise in `ubuntu-latest`, not Bun setup.
- `docs-site/` did not contain real Bun command/setup paths in the scoped search.
- `ts/patches/@earendil-works%2Fpi-ai@0.78.0.patch` is active patch provenance. A local temp-copy probe removed the patch hunk from `dist/index.js` and confirmed Node still exposes `stream`, `complete`, `streamSimple`, and `completeSimple` through the unpatched `export *` barrel. That makes patch removal a good follow-up candidate, but the package metadata and pnpm lockfile were intentionally left unchanged in this reconciliation slice.

## Objective Impact

This completes the inventory, stale-reference cleanup, template policy decision, accepted-reference classification, and reconciliation evidence rows for this Objective. The result is not a repository-wide Bun string purge; it is a classified end state where remaining references are either deliberate, historical/provenance-only, compatibility/safety handling, substring noise, or a focused follow-up.

The project-template open question is resolved by retaining `create-bun-typescript-project` as explicitly Bun-centric product guidance while documenting its boundary. The docs-site scope question is resolved by evidence that no real docs-site Bun command/setup path remains in the scoped search. Compatibility references are recorded in Objective tracking rather than removed blindly.

## Follow-Ups

- Consider a focused package-metadata slice to remove `ts/patches/@earendil-works%2Fpi-ai@0.78.0.patch` and the corresponding `patchedDependencies`/lockfile entries, with full pnpm install, typecheck, and tests.
- If the repository wants a Node/pnpm/Vitest project creation skill, create or select that as a separate product decision rather than mutating the explicitly Bun-centric template.
