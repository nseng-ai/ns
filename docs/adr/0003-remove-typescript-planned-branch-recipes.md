# ADR 0003: Remove TypeScript Planned-Branch Recipes

## Status

Accepted

## Context

The branch-context workflow briefly included an experimental TypeScript recipe format backed by `@asdl/ts-plans`, `.plan.ts` local saved plans, Pi-only recipe evaluation, TypeScript-specific Pi commands/tools, and a hidden preview CLI operation.

That experiment showed useful design possibilities, but it also added a second planning language, trusted local code evaluation, cross-harness ambiguity, and broad maintenance surface across package dependencies, tests, docs, skills, and lockfile state.

## Decision

Remove TypeScript branch-context recipe support from active code and user-facing workflow surfaces now.

Markdown remains the only active branch-context plan format. The TypeScript recipe design is parked in `docs/pi/ts-plans-design-retrospective.md` for possible future revival after an explicit product, trust, and portability decision.

## Consequences

- `@asdl/ts-plans` and active `.plan.ts` commands, tools, CLI operations, dependencies, and tests are removed.
- Branch-context saved plans and attached plans use Markdown files and `.md` Branch Memory keys only.
- Current-repo local saved `.plan.ts` artifacts are obsolete and deleted as part of this cleanup.
- Future TypeScript recipe work should reintroduce new active code deliberately, using the retrospective as historical input rather than keeping dormant compatibility code.
