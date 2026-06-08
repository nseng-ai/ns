# Bun-to-Node TypeScript Migration: Bun-Reference Reconciliation

## Thesis

The TypeScript workspace migration has moved active tooling, tests, and project-local runtime paths toward the Node + pnpm + Vitest contract, but broad Bun references may still remain in documentation, scripts, templates, and historical guidance. This child Objective owns the final reconciliation pass: distinguish stale active instructions from deliberate or historical Bun references, then update only the references that would mislead current development or runtime work.

The desired outcome is not a repository-wide string purge. It is a clear, evidence-backed classification of remaining Bun references so future agents can tell which ones are obsolete, which ones are intentionally retained, and which ones belong to product/template choices outside this migration.

## Scope

This Objective covers Bun-reference reconciliation for active TypeScript and repo guidance surfaces after the pnpm, Vitest, and Node runtime child Objectives:

- inventory active Bun references in TypeScript workspace files, project-local Pi extension guidance, repo agent instructions, docs-site/deploy commands where in scope, and relevant project templates;
- update active instructions, scripts, or docs that still imply Bun is required for current TypeScript workspace install, test, CLI launch, Pi extension, or docs-site workflows;
- classify remaining references as deliberate template/product guidance, historical/provenance text, compatibility/safety handling, or out-of-scope material;
- decide whether Bun-centric project templates should remain deliberate product guidance or be changed as part of this migration;
- preserve the Node + pnpm + Vitest contract established by prior child Objectives without reopening their implementation details;
- record durable evidence of the final inventory, classifications, edits, and remaining accepted references.

## Non-Goals

- Do not redo pnpm workspace migration, Vitest migration, or Node runtime compatibility work already owned by sibling child Objectives.
- Do not remove every occurrence of the substring `bun` when it is historical, provenance-only, part of an unrelated word, or intentionally documenting an out-of-scope Bun template.
- Do not redesign Python tooling, the installed Pi package runtime, Graphite metadata reading, or package distribution strategy.
- Do not change project templates merely for aesthetic consistency; template behavior is a product decision that must be classified and, if changed, evidenced.
- Do not add hidden registries, YAML/frontmatter, UUIDs, or task-database state to track references.

## Completion Criteria

This Objective is complete when:

- a scoped inventory of remaining Bun references has been collected across active repo guidance, TypeScript workspace files, project-local Pi extension surfaces, docs-site/deploy guidance, and relevant templates;
- stale active instructions or scripts that would mislead current TypeScript workspace work have been updated to Node, pnpm, Vitest, or explicit out-of-scope wording;
- remaining Bun references are classified in durable Objective tracking as deliberate, historical/provenance-only, compatibility/safety handling, substring noise, or deferred product/template decisions;
- any project-template decision is recorded as either intentionally Bun-centric, migrated away from Bun, or parked with rationale;
- validation evidence covers affected docs/scripts/tests without inventing a broad repository-wide purge requirement.

## Assumptions and Risks

Assumptions:

- Node v24.12+, pnpm, and Vitest are already the settled TypeScript workspace contract from sibling Objectives.
- Active `ts/` package tests are Vitest-backed, and new TypeScript tests should not depend on Bun's test runner.
- Current project-local TypeScript CLIs and Pi extension runtime paths no longer require Bun after the Node runtime child Objective.
- Some Bun references are expected to remain because they are historical, provenance-only, compatibility/safety handling, or deliberate template/product guidance.

Risks:

- A mechanical string purge could remove useful history, break intentional Bun templates, or obscure compatibility handling that still matters.
- Leaving stale active instructions in AGENTS, docs, package scripts, deploy guidance, or templates could cause future agents to reintroduce Bun assumptions.
- Template decisions may be product-sensitive: changing a Bun project template can affect users who still want Bun for standalone projects outside the TypeScript workspace migration.
- Documentation-only changes can look complete while hidden scripts or generated guidance still refer to Bun; the inventory must include command surfaces and templates, not only prose.

## Open Questions

- Which project templates, if any, should remain explicitly Bun-centric as deliberate product guidance?
- Are docs-site deploy/build references fully in scope for this final reconciliation pass, or are any of them governed by separate docs-site release constraints?
- Should compatibility references such as generic `node|bun` runtime handling be documented in place, recorded only in Objective tracking, or left as self-explanatory code?
