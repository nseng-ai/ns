# Herdr Implementation Workflow Cutover

## Summary

The current Herdr public catalog is exactly:

- `/ns:herdr:impl:prompt:space`
- `/ns:herdr:impl:plan:space`
- `/ns:herdr:impl:plan:tab`
- `/ns:herdr:space:goal`
- `/ns:herdr:space:new`
- `/ns:herdr:space:objective-summary`
- `/ns:herdr:tab:goal`
- `/ns:herdr:tab:handoff` (optional Handoffs integration)
- `/ns:herdr:tab:new`

This is a clean breaking cutover. The former `/ns:herdr:launch:*`, branch-basis-specific `br`/`tr`, interim workflow-family, compound dispatch, and cmux names have no visible or hidden aliases.

The semantic boundary is now explicit: an `impl` workflow starts a responsible implementation attempt. The launched agent inspects the supplied prompt or Saved Plan and the repository, implements the request when valid, and otherwise stops with a concrete blocker or clarification request. Prepared Herdr Launch, destination/process startup, Pi launch mechanics, and `ns-launch` prompt transport/storage remain supporting mechanics. Handoff launch remains accurate for the durable `/ns:herdr:tab:handoff` workflow.

## Objective Impact

Code and tests supplied by the prior implementation agent establish the cutover:

- `ts/packages/capabilities/herdr/src/core/command-surfaces.ts` declares the exact command constants and eight-base/one-optional catalog.
- `ts/packages/capabilities/herdr/src/core/impl-prompt.ts` composes prompt implementation over tracked-branch payload storage and Prepared Herdr Launch.
- `ts/packages/capability-kit/src/kit/tracked-branch-payload.ts` builds the responsible-attempt instruction: inspect the repository, implement a valid request, or stop with a concrete blocker or clarification request.
- `ts/packages/capabilities/herdr/src/core/impl-plan.ts` composes Saved Plan selection, Branch Context attachment, contextual branch basis, and Attached Plan implementation into space or tab destinations.
- `ts/packages/capabilities/herdr/test/herdr-impl.test.ts`, `impl-branch-basis.test.ts`, and `extension.test.ts`, plus `ts/packages/capability-kit/test/unit/tracked-branch-payload.test.ts`, cover implementation behavior, branch selection, exact registration, removed aliases, and prompt semantics.

Validation already supplied by that implementation agent:

- Vitest: 12 files, 149 tests passed.
- Targeted Vitest: 4 files, 58 tests passed.
- `just ts-check` passed.
- `just ts-format-check` passed.
- `git diff --check` passed.

Current docs and Objective tracking now use the implementation vocabulary and exact catalog. `docs/herdr/command-catalog.md` replaces the predominantly current `cmux-parity-checklist.md` while preserving cmux migration history in prose.

## Follow-Ups

Do not close the Objective or add `closed.md`. The unrelated immutable Semantic Update `20260719T181812Z-reference-based-herdr-handoff-launch.md` still lacks headings required by the current Objective checker. Existing Semantic Updates must not be edited; an authorized checker compatibility mechanism is still required. Gated `docs-site/` drift also remains untouched by policy.
