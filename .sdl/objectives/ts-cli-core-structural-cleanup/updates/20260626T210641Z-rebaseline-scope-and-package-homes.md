# Rebaseline: `@sdl/*` scope, rehomed package layout, and drifted file facts

## Summary

Trunk-explicit, non-closing refresh against HEAD (`ba589946b`) from baseline
`952a792d5`. The Objective dir diff is empty (baseline was the last touch), so the
refresh re-verified material claims against current repository ground truth. The
findings remain substantively valid, but the durable text carried several stale
references that HEAD now contradicts:

- **Package scope.** `objective.md`/`roadmap.md` named the `@asdl/*` scope in many
  places; `rg "@asdl/" ts/` returns zero — the workspace is `@sdl/*` throughout
  (`@sdl/core`, `@sdl/brmem`, `@sdl/graphite`). Corrected.
- **Workspace rehome.** `ts/` packages were rehomed into `hosts/`, `infra/`,
  `capabilities/`, `tools/` (commit `c0353849e`). Concrete homes verified and
  recorded: `@sdl/core` → `ts/packages/infra/core/`, `@sdl/brmem` →
  `ts/packages/infra/brmem/`, `areg` → `ts/packages/tools/areg/`, `packagechk` →
  `ts/packages/tools/packagechk/`, `vibechk` → `ts/packages/tools/vibechk/`, `sdlcc`
  → `ts/packages/hosts/sdlcc/`, Pi → `ts/packages/hosts/pi/`. `ccc`, `aretro`,
  `sdl`, `roaster`, `branch-context`, `handoff`, `objective`, `plans`, `pr-address`
  stay top-level. A repository-layout note was added to `objective.md`.
- **CLI count.** "all 15 `cli.ts`" is now 14 (`slot` folded into `sdl slot`, Pi
  consolidated). All 14 current `ts/packages/**/src/cli.ts` verified to consume
  `defineCli`, so the completed shared-wiring row stays true.
- **`extension-kit` → `capability-kit`.** The above-SDK substrate is `@sdl/capability-kit`
  (commit `e859d7dd6`); the ADR 0009 layering guardrail was updated.
- **File-size drift.** `areg/real-gateways.ts` 1358 → 1383; `landing-operations.ts`
  1010 → 1052; `extension-discovery.ts` 531 → 583; `pi-jsonl-source.ts` still 767.
- **`resolveBranchOrCurrent` row.** No `resolveBranchOrCurrent` symbol exists (it was
  a proposed helper, never added — expected); the "4 copies / 3 rule-sets" tallies
  predate the rehome and the GitHub-gateway-layering refactor, so the row now asks to
  re-verify the copy count at pickup rather than asserting it.
- **`loadGraphiteTopology` placement.** The two read paths now live at
  `ccc/src/land-stack/graphite-topology.ts` and `stack-facts.ts`; with a new
  `@sdl/graphite` infra package, the canonical home is flagged to confirm at pickup
  (original target was `@sdl/core/graphite-metadata`).

## Verified still-true claims

- `branch-context` brmem-gateway migration complete: `src/brmem-gateway.ts` absent;
  `@sdl/core/brmem-cli` exports a single `runBrmem`; `resolveBrmemCommandCandidates`,
  `graphqlErrorsFromJson`, `readOptionalBrmemBooleanField` all absent from `ts/`.
- God-files still over the line: `tools/areg/src/real-gateways.ts` (1383),
  `ccc/.../landing-operations.ts` (1052, still hosts `performGraphiteMaintenance`).
- Open dedup targets still present: roaster keeps its own `ghAuthorSchema`/
  `normalizeAuthor` copies; `@sdl/core` still exports a root `.`; sdlcc
  `stack-map-model-loader.ts`, packagechk `claim-command.ts` (`ClaimPolicy`/`ClaimPlan`),
  vibechk `workflow.ts` (`normalizeRunsFormatArgs`), and `@sdl/core` `submit/`
  (`reconcilePrewrittenPr`) all still exist.

No roadmap checkbox states changed; the blocked-behind-`sdl-extension-architecture`
sequencing remains valid (extension-architecture work is actively continuing at HEAD).

## Objective Impact

`objective.md` and `roadmap.md` were rebaselined for scope/path/count/name accuracy;
no completion claim was inverted and no open row was opened or closed. No new PR
evidence was introduced.

## Follow-Ups

- At pickup of the Graphite-topology and `resolveBranchOrCurrent` rows, confirm the
  canonical package home and re-count duplications against the rehomed layout.
- After `sdl-extension-architecture` lands its foundation, reclassify the remaining
  open + absorbed-deepening rows per the existing sequencing note.

Provenance: objective-refresh basis target=HEAD from=952a792d5
