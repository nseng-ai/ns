# Roadmap

## Work

- [x] Inventory remaining Bun references by active surface.
      Search active TypeScript workspace files, project-local Pi extension adapters/guidance, repo agent instructions, docs-site/deploy guidance, and relevant templates. Separate true active workflow references from historical text, patch provenance, substring noise, and compatibility/safety handling.
      Evidence: Semantic Update `20260608T225406Z-bun-reference-inventory-and-policy.md` records the scoped search results, substring-noise filtering, active TypeScript workspace checks, and remaining reference classifications.

- [x] Update stale active workflow guidance.
      Replace or clarify references that still tell current contributors or agents to use Bun for TypeScript workspace install, tests, CLI launch, Pi extension development, or active docs-site commands when the settled contract is Node + pnpm + Vitest. Evidence should include targeted docs/script checks where applicable.
      Evidence: `justfile` no longer says the planned-branch CLI uses a Bun shebang, and `skills/code-gt-restack-resolve/SKILL.md` no longer grants `Bash(bun run *)` for restack conflict resolution.

- [x] Decide template policy for Bun-centric project creation guidance.
      Review project templates and creation skills that intentionally produce Bun projects. Record whether each remains deliberate product guidance, migrates to Node/pnpm/Vitest, or is parked for a separate product decision.
      Evidence: `skills/create-bun-typescript-project/` remains deliberate standalone Bun product guidance, and its `SKILL.md` now states it is not the default template for existing Node, pnpm, or Vitest workspaces, or for migrations away from Bun.

- [x] Classify and record accepted remaining references.
      Record the final classification of remaining Bun references as deliberate template/product guidance, historical/provenance-only, compatibility/safety handling, substring noise, or deferred out-of-scope material. Avoid editing historical records solely to reduce search hits.
      Evidence: Semantic Update `20260608T225406Z-bun-reference-inventory-and-policy.md` classifies accepted remaining references, including historical retrospectives/Objectives, `ubuntu-latest` substring noise, runtime compatibility guards, and active patch provenance.

- [x] Close the reconciliation slice with evidence.
      Ensure durable tracking captures changed files, validation commands, accepted references, and follow-ups. Completion evidence should prove no stale active Bun instructions remain in the scoped surfaces, not that every `bun` substring disappeared.
      Evidence: targeted post-edit search and dprint validation passed; the active `@earendil-works/pi-ai` patch was locally probed as a removal candidate but left for a focused package-metadata/lockfile follow-up.

## Parked

- [ ] Redesign standalone Bun project templates only if the repository decides those templates should stop creating Bun projects by default.
- [ ] Revisit published-package or non-workspace install behavior only if a future Objective expands beyond project-local workspace assumptions.
