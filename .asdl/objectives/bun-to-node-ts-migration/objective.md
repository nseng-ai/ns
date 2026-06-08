# Bun-to-Node TypeScript Migration Umbrella

## Thesis

The Bun-to-Node TypeScript migration should remain a coordinating umbrella rather than one broad implementation backlog. This Objective preserves the migration premise, boundaries, and ordering, then spins focused child Objectives out of the roadmap. Each child owns its own detailed plan, implementation evidence, validation, parking decisions, and closure after it is created.

The desired end state of the objective family is still a Node-centered TypeScript and documentation tooling contract using pnpm for package management, Vitest for tests, and Node-safe runtime code for Pi extensions and local CLIs. The umbrella's active job is to sequence that migration into coherent subobjectives so the work can land as smaller, independently understandable branches instead of one oversized roadmap.

## Scope

This Objective covers only umbrella coordination for the Bun-to-Node migration family:

- Preserve the overall migration intent: tests, package scripts, lockfiles, CLI launch paths, docs-site workflows, and project-local Pi extension runtime assumptions should converge on Node-compatible behavior.
- Maintain the child Objective creation checklist for the major migration slices.
- On `objective-next`, choose one unchecked roadmap item, create a child Objective with slug pattern `bun-to-node-ts-migration-<topic>`, and mark that umbrella item `[x]`.
- Keep child implementation progress, validation evidence, risks discovered during implementation, parking decisions, and closure out of this umbrella after each child is created.
- Use this umbrella to decide sequencing and prevent scope from collapsing back into a single giant branch.

The retained child Objective candidates are tooling contract, pnpm workspace migration, Vitest test migration, Node runtime compatibility, and remaining Bun-reference reconciliation.

## Non-Goals

- Do not implement the migration inside this umbrella.
- Do not spawn every child Objective up front unless the user explicitly asks for a bulk planning branch.
- Do not mirror child roadmap status, validation, PR state, review feedback, parking decisions, or closure in the umbrella after a child is created.
- Do not migrate the Python package/tooling stack.
- Do not redesign Pi itself or change the installed Pi package runtime beyond what is needed for project-local extension compatibility.
- Do not use npm plus Node's built-in test runner as the default migration path unless later evidence in a child Objective overturns the pnpm + Vitest premise.
- Do not add YAML/frontmatter, UUIDs, hidden parent/child metadata, registries, task databases, schedulers, or state-machine behavior.

## Completion Criteria

This umbrella is complete when:

- every roadmap checklist item has been marked `[x]` because its corresponding child Objective was created;
- each created child Objective is self-contained enough to carry its own implementation plan, evidence expectations, assumptions, risks, and open questions;
- no unchecked child-creation items remain in this umbrella roadmap.

The umbrella does not wait for child Objectives to finish. Child implementation, review, validation, roadmap progress, parking decisions, and closure belong to the child records.

## Definition of Progress

Progress is keepable when exactly one unchecked roadmap item has been turned into a child Objective under `.asdl/objectives/bun-to-node-ts-migration-<topic>/`, and the corresponding umbrella roadmap item has been marked `[x]`.

The child Objective should preserve the relevant migration context and decisions needed for that slice, but the umbrella should not pre-solve the child's implementation details or track later progress.

## Runner Policy

This Objective is execution-friendly for `objective-next` only for child Objective creation.

After the Tracking Gate passes, `objective-next` may offer to execute one unchecked roadmap item at a time. A confirmed execution may:

- create one child Objective using slug pattern `bun-to-node-ts-migration-<topic>`;
- write that child's initial `objective.md`, `roadmap.md`, and `updates/` directory through existing Objective creation conventions;
- mark the selected umbrella roadmap item `[x]`;
- leave child implementation, validation, parking, and closure to the child Objective.

The execution preview must name the selected item, intended child slug/title, files to create, and the one umbrella row to check off. Stop and ask before changing slug patterns, adding hidden state, spawning multiple children, editing child progress after creation, changing Objective CLI behavior, or touching external systems.

Branch creation, commits, Graphite operations, PR submission, publishing, deployment, and remote write APIs are out of scope unless the user explicitly asks for them in the confirmed preview.

## Assumptions and Risks

Assumptions:

- Node v24+ remains the expected baseline for this repository's TypeScript tooling and runtime behavior unless a child Objective records contrary evidence.
- pnpm plus Vitest remains the preferred migration direction because pnpm fits the existing workspace shape better than npm and Vitest is likely lower-friction than Node's built-in test runner for current matcher-heavy tests.
- Pi's installed CLI will continue to execute project-local extensions under Node, so extension runtime compatibility should be validated with Node even if tests are run by another tool.
- Focused child Objectives will make the migration easier to review and land than one broad implementation Objective.

Risks:

- Future agents may re-complicate the umbrella into a mirrored tracker; the mitigation is the explicit Non-Goals and narrow Runner Policy.
- Child slugs may drift; the mitigation is the `bun-to-node-ts-migration-<topic>` prefix convention and intended slug on each roadmap row.
- `node:sqlite` is available on current Node v24 but still emits an experimental warning; the relevant child Objective must decide whether to suppress, accept, or document that warning.
- Node TypeScript execution remains a policy choice: relying on native type stripping may produce experimental warnings or fail on non-erasable syntax, while building CLIs introduces a dist/build workflow.
- Package-manager migration can expose dependency resolution differences, especially for patched dependencies and Pi peer dependencies.
- Vitest mocking semantics may not exactly match Bun's `mock.module`, so module-mocking tests need careful conversion rather than blind import replacement.
- Removing Bun from docs-site deploy configuration may surface hosting or Astro version constraints separate from the TypeScript workspace itself.

## Open Questions

No umbrella setup questions remain open. The child Objectives should own their slice-specific open questions, especially CLI execution policy, `node:sqlite` warning handling, docs-site sequencing, and whether Bun-centric project templates should remain deliberate product guidance.
