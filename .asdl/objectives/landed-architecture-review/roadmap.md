# Roadmap

## Work

- [ ] Assess and decide the cmux command-suite architecture seam.
      Review mode: run `improve-codebase-architecture` first, then `thermo-nuclear-code-quality-review` against the large TypeScript implementation and orchestration paths.
      Evidence: identify whether `ts/packages/pi-extensions/src/cmux/`, `.pi/extensions/cmux.ts`, `src/asdl_tools/cmux/`, and `asdl exec cmux-workspace-summary` form one coherent deep module or several shallow workflow modules; execute the first worthwhile deepening slice or park with rationale.

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
