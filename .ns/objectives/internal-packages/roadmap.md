# Roadmap

## Work

- [x] Charter the internal space: rename `ts/packages/local/` → `ts/packages/internal/`, rewrite its section in `ts/packages/README.md` (tested repo-internal tooling; promotion ladder `.ns/*` → `internal/*` → platform; explicit `internal/` vs `tools/` distinction — enforced no-outside-runtime-dependents and never published vs. standalone and potentially shippable), and update all `packages/local` references.
      Evidence: the `local/`→`internal/` rename and reference sweep landed in the prior PR of this stack; the `ts/packages/README.md` charter (promotion ladder, `internal/` vs `tools/`, dependency semantics) was rewritten in this PR.
- [ ] Add the internal rung to `docs/conventions/platform-and-consumer.md`: consumer-side tested tooling, with explicit promotion paths in (from `.ns/*`) and out (to platform). Report the taxonomy change to the repo-ontology objective per its drift rules.
- [x] Carry the boundary rule through the rename: rename `NS_TS_LOCAL_SPACE_ADMISSION` and the `LOCAL_SPACE_DIR`/scope constants in the style guard to the internal space, extend only if a gap appears, and document the dependency semantics (runtime dependencies on `internal/*` banned from outside; `devDependencies` and test consumption allowed).
      Evidence: the existing failing-case and real-repo conformance tests updated and passing under the new names. Dependency semantics documented in the `ts/packages/README.md` charter in this PR.
- [ ] Audit the repo for internal-package candidates: `ts/packages/*` packages that are repo-internal (e.g. `@ns/vibechk` in `ts/packages/tools/`), machinery embedded in test-support trees, justfile-recipe scripts, `.ns/*` workspace tools (`../.ns/reviews/*/tools/*`), and Pi extensions. Deliverable: a per-candidate promote/keep/park report recorded under this objective.
- [ ] First resident: extract the subpackage conformance machinery out of `ts/packages/infra/core/test/support/typescript-style-guard/` into `ts/packages/internal/`, with the style guard consuming it from there as a dev/test dependency.
      Evidence: style guard suite passes against the extracted package.

## Parked

- [ ] Ghost-directory guard: ~26 untracked node_modules-only remnant directories sit under `ts/packages/` (e.g. top-level `sdl/`, `flow/`, `vibechk/`, `local-pi-tools/`, `packagechk/`). Disk cleanup is per-worktree and cannot land as repo work; if wanted, add a style-guard rule that flags package-less directories instead.
- [ ] Migrations of audit candidates beyond the first resident — sequence from the audit report once dispositions are accepted.
