# cmux and Open-Branch Removal Complete

## Summary

The standalone `@nseng-ai/cmux` capability and its project Pi adapter are removed. Capability Kit no longer exports or contains a cmux subpackage, and `MODEL_OPERATION_IDS.cmuxSidebar` is gone. The Pi runtime type facade now imports the canonical `@nseng-ai/capability-kit/pi-types` surface.

Herdr no longer registers or implements `/ns:herdr:space:open-branch`. Its dedicated core/Pi modules and command-specific scenarios are removed, while `core/slot.ts` launch helpers and their dispatch-oriented coverage remain for prompt and plan workflows.

Workspace manifests, generated lockfile entries, publish inventory, Pi settings, runtime-import coverage, and TypeScript style-guard topology are pruned. Generic style-guard policy scenarios now use the surviving Slots capability as their fixture.

## Objective Impact

The roadmap row **“Remove standalone Herdr open-branch and the cmux capability”** is complete. A surviving-consumer audit found no non-cmux production consumer of the Capability Kit command, gateway, or focused-terminal-tab values; the sole external cmux-types consumer was migrated to `pi-types`. Exact implementation/configuration searches now leave cmux references only in explicitly deferred documentation/context, generic string-format fixtures, and the root TypeScript agent note that names the removed package as a historical nested-instructions example.

Validation passed with the full repository `just` entrypoint: dependency, dprint, TypeScript format/lint/type checks, all 6,658 default tests, all 148 TypeScript style-guard tests, and the all-Objective edge sweep. Focused Herdr and Capability Kit tests (106 tests), focused ns-dev/foundation tests (230 tests), the Pi runtime-import integration test (5 tests), and `git diff --check` also passed. The generated lockfile changed only by deleting the root/areg cmux links and the removed package importer.

The plan-specific `ns objective check retire-cmux-herdr-handoff-namespace` gate remains red because the pre-existing immutable update `20260719T181812Z-reference-based-herdr-handoff-launch.md` lacks the now-required `Summary`, `Objective Impact`, and `Follow-Ups` headings. This slice did not rewrite that historical update; the new update and roadmap edits pass their structural checks, and `just`'s repository-wide Objective edge sweep is green.

## Follow-Ups

- Reconcile deferred live documentation, contexts, package-count prose, and dedicated cmux docs in the roadmap's separate topology/documentation row.
- Preserve historical records and generic command-format fixtures where cmux is merely inert sample text.
- Design and disposition `/ns:herdr:handoff:trunk-plan` before closing the Objective.
