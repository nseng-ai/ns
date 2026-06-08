# Roadmap

## Work

- [ ] Inventory remaining Bun references by active surface.
      Search active TypeScript workspace files, project-local Pi extension adapters/guidance, repo agent instructions, docs-site/deploy guidance, and relevant templates. Separate true active workflow references from historical text, patch provenance, substring noise, and compatibility/safety handling.

- [ ] Update stale active workflow guidance.
      Replace or clarify references that still tell current contributors or agents to use Bun for TypeScript workspace install, tests, CLI launch, Pi extension development, or active docs-site commands when the settled contract is Node + pnpm + Vitest. Evidence should include targeted docs/script checks where applicable.

- [ ] Decide template policy for Bun-centric project creation guidance.
      Review project templates and creation skills that intentionally produce Bun projects. Record whether each remains deliberate product guidance, migrates to Node/pnpm/Vitest, or is parked for a separate product decision.

- [ ] Classify and record accepted remaining references.
      Record the final classification of remaining Bun references as deliberate template/product guidance, historical/provenance-only, compatibility/safety handling, substring noise, or deferred out-of-scope material. Avoid editing historical records solely to reduce search hits.

- [ ] Close the reconciliation slice with evidence.
      Ensure durable tracking captures changed files, validation commands, accepted references, and follow-ups. Completion evidence should prove no stale active Bun instructions remain in the scoped surfaces, not that every `bun` substring disappeared.

## Parked

- [ ] Redesign standalone Bun project templates only if the repository decides those templates should stop creating Bun projects by default.
- [ ] Revisit published-package or non-workspace install behavior only if a future Objective expands beyond project-local workspace assumptions.
