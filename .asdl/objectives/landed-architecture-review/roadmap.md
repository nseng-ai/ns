# Roadmap

## Work

- [x] Assess and decide the cmux command-suite architecture seam.
      Review mode: `improve-codebase-architecture` was used first; the named `thermo-nuclear-code-quality-review` skill was unavailable, so a local implementation-structure pressure-test was applied against the large TypeScript workflow path.
      Evidence: the cmux suite is several workflow Modules rather than one coherent deep Module. The Python workspace-summary path already has a deep `CmuxGateway`/exec seam. The first worthwhile deepening slice consolidated `/cmux-slot:dispatch-plan` onto the shared `cmux/slot.ts` and `cmux/worktree-description.ts` slot-launch Module, deleting duplicate checkout/open/worktree-description implementation from `slot-dispatch-plan.ts`. Validation: `bun run --cwd ts/packages/pi-extensions check`; `bun test ts/packages/pi-extensions/test/cmux.test.ts`.

- [ ] Assess and deepen the Pi CLI command lifecycle interface.
      Review mode: run `improve-codebase-architecture` first, then `thermo-nuclear-code-quality-review` for file-size, branching, confirmation, and rendering complexity.
      Evidence: review parsing, confirmation, live output, custom rendering, usage-error restoration, and headless behavior in `ts/packages/pi-extensions/src/cli-command-extension.ts` and `ts/packages/asdl-dev/src/submit.ts`; implement or park a harness-neutral command lifecycle seam.

- [ ] Review Graphite and source-control mutation UX for shared policy.
      Review mode: run `improve-codebase-architecture` first, then `thermo-nuclear-code-quality-review` to pressure-test mutation-flow branching and recovery paths.
      Evidence: compare `asdl-dev submit`, `land-stack`, and cmux dispatch recovery/confirmation behavior; implement a shared policy module or record why per-command policies should remain separate.

- [ ] Reassess handoff artifacts over Branch Memory.
      Review mode: run `improve-codebase-architecture` first; add `thermo-nuclear-code-quality-review` only if the inventory/storage implementation shows branching or wrong-layer complexity.
      Evidence: inspect `packages/asdl-handoff/`, `packages/brmem/`, `skills/handoff-save`, `skills/handoff-load`, and Pi handoff code; decide whether handoff artifact behavior is deep enough or needs a stronger module/interface over Branch Memory.

- [ ] Review slot operation occupancy locality.
      Review mode: run `improve-codebase-architecture` first, then `thermo-nuclear-code-quality-review` for scattered occupancy checks and duplicated recovery-message complexity.
      Evidence: inspect rebase/bisect occupancy handling across `asdl-core` Git gateways and `asdl-slots` lifecycle commands; consolidate policy or document why current command-local handling has enough locality.

- [ ] Review saved-plan, planned-branch, and cmux dispatch identity seams.
      Review mode: run `improve-codebase-architecture` first; add targeted `thermo-nuclear-code-quality-review` if the cmux dispatch implementation becomes part of the slice.
      Evidence: compare saved-plan filename slugging, content-derived planned-branch slugging, Branch Memory attachment, and cmux slot dispatch; implement or park a clearer identity/dispatch seam.

- [ ] Review agent resource and skill ontology consumers.
      Review mode: run `improve-codebase-architecture`; use `thermo-nuclear-code-quality-review` only if a concrete code-heavy implementation slice emerges.
      Evidence: inspect public/internal/vendored skill identity across symlink layout, docs, lockfiles, Roaster diff filtering, and root instructions; implement or park a canonical resource interface for tools and docs.

## Parked

No parked work yet.
