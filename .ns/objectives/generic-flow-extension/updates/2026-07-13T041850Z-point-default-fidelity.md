# PR-description point-default fidelity completed

## Summary

Completed audit finding F10 for `flow.submit.pr-description`. Flow's extension descriptor
now declares `../submit/prompts/pr-description-default.md` as the point default, and the
SDK's intentionally duplicated first-party fallback metadata mirrors that `defaultPath`
without inventing descriptor provenance. Descriptor-backed catalog and CLI inspection now
report the packaged default, its Flow manifest path, and the active default source.

PR-description generation now resolves one normal point catalog with the existing source
order: development environment override, explicit `ns.toml` installation, conventional
`.ns/prompts/flow.submit.pr-description.md`, then the descriptor default. Runtime reads only
the selected source. Missing, unreadable, or empty selected repository policy returns an
actionable failure instead of falling through; the packaged source retains the existing
`{ type: "builtin" }` presentation and prompt trimming, so model selection and fingerprints
do not change.

The initial direct descriptor import from Flow's `submit` subpackage exposed a prohibited
`submit -> ns` topology cycle. The final implementation instead requires descriptor
provenance as an injected dependency and supplies `flowExtensionDescriptorSource` at the
lazy `ns` submit and regenerate command boundaries, following the existing recovery
boundary shape. No topology exemption, Flow-only registry, synthetic manifest path, or
first-party catalog consolidation was added.

## Objective Impact

The **Point-default fidelity** sub-slice of the audit-driven genericization roadmap row is
complete. The parent row remains active for repository identity, Graphite machine facts,
and Pi ownership. F11 remains parked: the descriptor is canonical for resolvable packaged
provenance while the SDK mirror remains fallback metadata.

No point id, prompt content, model, source label, fingerprint schema/value, recovery
behavior, or unrelated built-in point changed. The existing points guide, ADR 0031, README
draft, Objective wording, and orientation remain accurate and required no edit.

## Validation

- Plan-focused default-lane command:
  `pnpm --dir ts exec vitest run --config vitest.config.ts packages/capabilities/flow/test/unit/pr-description.test.ts packages/sdk/test/unit/project-config-points.test.ts packages/sdk/test/integration/extension-point-descriptor-resolution.test.ts packages/sdk/test/scenario/extension-points-cli.test.ts` — the default config selected 3 files and all 49 tests passed.
- Dedicated descriptor integration command:
  `pnpm --dir ts exec vitest run --config vitest.integration.config.ts packages/sdk/test/integration/extension-point-descriptor-resolution.test.ts` — 1 file and all 6 tests passed.
- `pnpm --dir ts --filter @nseng-ai/flow test` — 84 files and all 824 tests passed.
- `pnpm --dir ts --filter @nseng-ai/sdk test` — all 246 tests passed.
- `just ts-check` passed.
- `just ts-test-typescript-style-guard` — all 148 tests passed, including the Flow
  subpackage topology guard.
- Targeted TypeScript format/lint checks and `git diff --check` passed.
- Full repository `just` passed: dependency, dprint, TypeScript format/lint/typecheck,
  style guard (148 tests), default suite (520 files / 5,389 tests), and Objective sweep.

Completion greps find no `submit -> ns` import, no production
`DEFAULT_PR_DESCRIPTION_SYSTEM_PROMPT`, and no bespoke fallback-catalog/path symbols in
`pr-description.ts`.

## Follow-Ups

- Complete the remaining audit-driven repository identity, Graphite machine-facts, and Pi
  ownership slices.
- Keep F11's first-party point-definition consolidation parked until it has an owning
  design.
- Promote the settled README after implementation and documentation match its contract.
