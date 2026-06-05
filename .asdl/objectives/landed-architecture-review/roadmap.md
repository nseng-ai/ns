# Roadmap

## Work

- [x] Assess and decide the cmux command-suite architecture seam.
      Review mode: `improve-codebase-architecture` was used first; the named `thermo-nuclear-code-quality-review` skill was unavailable, so a local implementation-structure pressure-test was applied against the large TypeScript workflow path.
      Evidence: the cmux suite is several workflow Modules rather than one coherent deep Module. The Python workspace-summary path already has a deep `CmuxGateway`/exec seam. The first worthwhile deepening slice consolidated `/cmux-slot:dispatch-plan` onto the shared `cmux/slot.ts` and `cmux/worktree-description.ts` slot-launch Module, deleting duplicate checkout/open/worktree-description implementation from `slot-dispatch-plan.ts`. Validation: `bun run --cwd ts/packages/pi-extensions check`; `bun test ts/packages/pi-extensions/test/cmux.test.ts`.
      Re-baseline (2026-06-05): the follow-up seam this row's update suggested (a separate planned-branch creation/attachment seam) has since been built as the `@asdl/planned-branch` package; see the Parked "saved-plan / planned-branch / dispatch identity" entry.

- [ ] Assess and deepen the Pi CLI command lifecycle interface.
      Review mode: run `improve-codebase-architecture` first, then `thermo-nuclear-code-quality-review` for file-size, branching, confirmation, and rendering complexity.
      Evidence: review parsing, confirmation, live output, custom rendering, usage-error restoration, and headless behavior in `ts/packages/pi-extensions/src/cli-command-extension.ts` and `ts/packages/asdl-dev/src/submit.ts`; implement or park a harness-neutral command lifecycle seam.
      Re-baseline (2026-06-05): both cited files still exist. The rendering/command-handler area churned in the window (`renderResult`/`renderCall` on `write_source_branch_plan_file`, a shared structured grill command handler), so re-read those before naming the seam. Cluster still valid.

- [ ] Review Graphite and source-control mutation UX for shared policy.
      Review mode: run `improve-codebase-architecture` first, then `thermo-nuclear-code-quality-review` to pressure-test mutation-flow branching and recovery paths.
      Evidence: compare `asdl-dev submit`, `land-stack`, and cmux dispatch recovery/confirmation behavior; implement a shared policy module or record why per-command policies should remain separate.
      Re-baseline (2026-06-05): partially overtaken. `land-stack` is now discriminated returned data (`LandStackFailure`/`LandStackResult`) with `presentLandStackFailure` on a named-options object, and the `asdl-dev-submit-consolidation` Objective is closed. Narrow the surviving question to shared mutation policy across the already-refactored submit and land-stack flows plus cmux dispatch recovery/confirmation.

- [ ] Reassess handoff artifacts over Branch Memory.
      Review mode: run `improve-codebase-architecture` first; add `thermo-nuclear-code-quality-review` only if the inventory/storage implementation shows branching or wrong-layer complexity.
      Evidence: inspect `packages/asdl-handoff/`, `packages/brmem/`, `skills/handoff-save`, `skills/handoff-load`, and Pi handoff code; decide whether handoff artifact behavior is deep enough or needs a stronger module/interface over Branch Memory.
      Re-baseline (2026-06-05): now overlaps the separate `/handoff-tab` Objective, and parser-as-data conversion plus a `handoffs` namespace remap and `handoff list --include-deleted` already landed. Coordinate with `/handoff-tab` and narrow the surviving question to whether a stronger module/interface over Branch Memory is warranted beyond what those slices delivered.

- [ ] Review slot operation occupancy locality.
      Review mode: run `improve-codebase-architecture` first, then `thermo-nuclear-code-quality-review` for scattered occupancy checks and duplicated recovery-message complexity.
      Evidence: inspect rebase/bisect occupancy handling across `asdl-core` Git gateways and `asdl-slots` lifecycle commands; consolidate policy or document why current command-local handling has enough locality.
      Re-baseline (2026-06-05): lightest drift in the window (only `slot free` gained a unified `--all` flag). Cluster still valid as written.

- [ ] Review cross-cutting failure-as-data and gateway-extraction conventions.
      Review mode: run `improve-codebase-architecture` first to name the shared error/boundary contract; add `thermo-nuclear-code-quality-review` only on a concrete code-heavy slice.
      Evidence: the dominant architecture trend in the 2026-06-03 → 06-05 window was converting throw-based paths to discriminated returned data (`land-stack`, handoff/objective parsers, runner runtime, `ResolvePlanEvidence`, `brmem` envelope parsing; removal of `HandoffUsageError`/`CustomCliUsageError`/`RuntimeResultParseError`) and extracting semantic gateways (`AregEnvironment`, `SkillxWorkspaceInstaller`, `PlannedBranch{Git,Brmem,Graphite}Gateway`). Assess whether these share a contract worth naming as a convention/helper, or park with rationale. The payload-artifact / sidecar architecture is out of scope here — it is owned by the `agent-payload-artifacts` Objective.

## Parked

- **Saved-plan, planned-branch, and cmux dispatch identity seams — superseded.**
  Original intent: compare saved-plan filename slugging, content-derived planned-branch slugging, Branch Memory attachment, and cmux slot dispatch; implement or park a clearer identity/dispatch seam.
  Parked 2026-06-05: this seam was built outside this Objective. The `@asdl/planned-branch` package now owns it — `deriveContentSlug` collapses plan-content and saved-plan slug derivation into one helper, and `PlannedBranchBrmemGateway` / `PlannedBranchGitGateway` / `RealPlannedBranchGraphiteGateway` carry attachment and dispatch, composed from both Pi create and cmux dispatch. Delivered by the now-closed `planned-branch-ts-cli` and `planned-branch-quality-hardening` Objectives. Do not re-suggest building this seam; reopen only if a concrete cross-package identity drift appears that those packages do not cover.

- **Agent resource and skill ontology consumers — substantially superseded.**
  Original intent: inspect public/internal/vendored skill identity across symlink layout, docs, lockfiles, Roaster diff filtering, and root instructions; implement or park a canonical resource interface for tools and docs.
  Parked 2026-06-05: the lockfile/skill-install half landed via the now-closed `areg-review-remediation` Objective — typed `SkillsLockfile`/`LockfileSkill` parsing, `LockfileConsistencyCheck` surfacing 12 `PENDING_REGEN` debt entries, skill-install validation hardening (reject malformed/symlink entries, missing `SKILL.md`), and the `SkillxWorkspaceInstaller` gateway. The remaining symlink-layout / docs / Roaster-diff-filtering identity question is not yet a canonical interface but is low-leverage on its own; reopen only if those consumers show concrete drift after the lockfile work settles.
