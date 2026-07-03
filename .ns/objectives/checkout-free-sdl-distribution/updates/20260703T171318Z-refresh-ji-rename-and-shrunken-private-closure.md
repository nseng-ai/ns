# Refresh: `ji` Rename Landed and Package Consolidation Shrank the Private Closure

## Summary

A trunk-state refresh verified the record against the current workspace and rebaselined it.
Two material shifts had landed since the record was written:

- **The ADR 0024 `sdl` → `ji` rename landed.** The kernel package is `@ji/kernel` with a
  `ji` bin at `./src/cli/index.ts` (run directly by Node ≥24, not through jiti at the
  entrypoint), capability packages are `@ji/*`, checked-in extension manifests moved to
  `.ji/extensions/*`, and the source-path jiti alias loader moved from
  `ts/packages/kernel/src/sdk/module-loader.ts` to
  `ts/packages/kernel/src/runtime/module-loader.ts` (it now builds aliases from capability
  `package.json` exports plus a virtual `@ji/kernel/sdk` module). The record previously
  described all of this in `sdl`/`@sdl` terms with the old loader path.
- **The private-package closure shrank.** The workspace is now 21 packages with 7 private
  (`@ji/kernel`, `@ji/capability-kit`, `@ji/ccc`, `@ji/flow`, `@ji/pi`, `jicc`,
  `@internal/pi-tools`), versus the ~29-of-45 recorded at creation. `@sdl/time`,
  `@sdl/exec`, and `@sdl/git` no longer exist as standalone packages; they are
  `@ji/core/time`, `@ji/core/exec`, and `@ji/capability-kit/git` subpaths. The triage
  roadmap row was moved to `[~]` on this consolidation progress; the recorded per-package
  decision table still does not exist.

Claims re-verified as still true: no build/bundle/dist step or `publishConfig` anywhere
(non-private packages declare only `files: ["src"]`); the pnpm `.bin/ji` shim hard-codes
this checkout's `NODE_PATH`; `ts/scripts/source-cli-shim-template` `run_checkout` refuses
to run without `ts/node_modules`; the extension-manifest parity test exists at
`ts/packages/kernel/test/integration/repo-local-extension-manifest-parity.test.ts`;
`.ji/extensions/AGENTS.md` still marks checked-in bundled artifacts "a liability";
`@ji/kernel` is still `private: true`; the `ship-objectives-to-customers` edge is mirrored
with a blocked sentence on the counterpart. The kernel now also depends on external
published npm packages (`@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`).

Provenance: objective-refresh basis target=5668ac5630b2bab397ef85b9e4cfe4d5cd84c420 from=trunk-HEAD

## Objective Impact

`objective.md` and `roadmap.md` were rewritten in current `ji` vocabulary with corrected
paths and package facts; the slug keeps its historical `sdl` name as durable identity. Two
open questions (bundle strategy; jiti vs prebuilt JS) were marked resolved at strategy
level by the 2026-07-01 Pi-style decision, leaving the inner published package name and
the disposition of the 7 remaining private packages as the live questions. The Objective
remains open and materially unstarted on its build/loader/publish rows.

## Follow-Ups

- Record the per-package publish vs bundle-inline vs exclude table for the 7 private
  packages to complete the triage row.
- This record's edge annotation and the `ship-objectives-to-customers` counterpart
  annotation/blocked sentence still say `sdl`; refresh did not touch frontmatter — update
  both sides via an explicit `objective-update` if the stale naming matters.
