# Handoff: Vendor Gitplane identity codecs

Continuation focus: Replace the proposed `ulid` and `@scure/base` runtime dependencies with clearly attributed vendored source under a `vendored/` folder, including a README that explains provenance, licensing, scope, and local modifications.

## Context

This branch addresses PR #4064 feedback for Gitplane artifact creation and identity foundations. Two reviewed follow-up commits are already present after restacking: `c40c01514` (mechanical cleanup) and `43bca2729` (singular artifact gateway identity). The user then rejected maintaining a hand-rolled ULID encoder, but subsequently clarified that both ULID generation/validation and Crockford Base32 should be vendored rather than installed as dependencies.

## Current State

The worktree is intentionally dirty with an incomplete dependency-based experiment across eight files. It currently adds catalog/package/lock entries for `ulid@3.0.2` and `@scure/base@2.0.0`, changes ULID validation/generation to use `ulid`, and changes Crockford Base32 encoding to use `@scure/base`. These edits are uncommitted and should be transformed into the vendored design rather than committed as dependencies.

Before the `@scure/base` experiment, the dependency-based ULID change passed focused tests/typecheck and broad validation. After adding `@scure/base`, full validation was not rerun to completion in the final state. Existing revision/event tests pin exact `gpr_` and `gpe_` vectors and should prove byte-for-byte Crockford encoding compatibility.

## Decisions / Findings

- Do not take runtime dependencies on `ulid` or `@scure/base` for this work.
- Create an explicit Gitplane-owned `vendored/` folder and a README explaining exactly what came from where. Confirm the best location under `ts/packages/incubating/infra/gitplane/src/` from local module ownership before editing.
- Vendor only the minimal source required for canonical ULID generation/validation and Crockford Base32 byte encoding; do not copy entire packages blindly.
- Preserve required behavior: canonical lowercase ULIDs, first character `0` through `7`, injected clock, cryptographically secure randomness in production, branded `ArtifactId`, and exact existing revision/event identity vectors.
- Preserve upstream license notices and record upstream repository, package/version or commit, source file(s), license, copied symbols/logic, and local changes in the vendored README. Check upstream package licenses/source before finalizing attribution.
- The `ulid` package's public `isValid` is case-insensitive and does not itself enforce the maximum first-character range, so Gitplane's canonical lowercase/max contract still needs an explicit boundary check.
- `@scure/base` exports `base32crockford`, but the user now wants that logic vendored rather than depended upon.
- Domain-specific logic in `identity.ts` should remain local: u64be framing, Gitplane hash input composition, artifact path validation, and revision/event derivation are normative Gitplane semantics, not generic library code.
- Remove `ulid` and `@scure/base` from `ts/pnpm-workspace.yaml`, the Gitplane `package.json`, and `ts/pnpm-lock.yaml` after the vendored implementation is in place.
- The user explicitly corrected the prior session for implementing during an analysis-only request. In the fresh session, summarize this handoff and wait for direction before editing, as requested by the pickup prompt.

## Next Steps

1. Summarize this handoff and wait for explicit user direction before continuing.
2. Inspect the current diff and upstream installed source/license files while dependencies are still locally available; capture only minimal required algorithms and attribution facts.
3. Decide and state the proposed `vendored/` module layout and README contents before mutation if the user asks for analysis/design first.
4. Replace dependency imports in `src/core/artifact.ts` and `src/core/identity.ts` with imports from the vendored modules.
5. Remove dependency/catalog/lock entries and ensure package installation leaves no new direct dependencies.
6. Keep or improve behavior-level tests for generated canonical IDs and retain exact revision/event vectors. Add focused vendored-code tests where upstream behavior is not already pinned.
7. Run Gitplane tests/check, dependency governance, integration, formatting, lint, TypeScript check/style guard, and `just`. Note the previously observed unrelated lint warning in `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/test/herdr-impl-prompt-bootstrap.test.ts:44` if it persists.
8. Review scope and only commit/submit if the user explicitly requests it.

## Investigation Sources

- Source Pi session ID: 019fc454-b7cd-7a05-9687-23b558b2dac6
- Source Pi session log: /Users/schrockn/.pi/agent/sessions/--Users-schrockn-.local-state-ns-slots-repos-ns-worktrees-slot-05--/2026-08-02T21-15-14-253Z_019fc454-b7cd-7a05-9687-23b558b2dac6.jsonl
- Related files:
  - `/Users/schrockn/.local/state/ns/enriched-plan/gh--nseng-ai--ns/gitplane-artifact-creation-gateways-identities/canonical-artifact-gateway-cli-refactor.md` — authoritative saved plan for the completed PR-feedback work and validation expectations.
  - `ts/packages/incubating/infra/gitplane/src/core/identity.ts` — current incomplete ULID/Base32 dependency experiment and Gitplane identity derivation.
  - `ts/packages/incubating/infra/gitplane/src/core/artifact.ts` — current incomplete ULID validation experiment and canonical `ArtifactId` schema.
  - `ts/packages/incubating/infra/gitplane/test/unit/identity.test.ts` — pinned digest/revision/event vectors and generated-ID behavior test.
  - `ts/packages/incubating/infra/gitplane/test/unit/artifact.test.ts` — canonical lowercase/max-range ULID validation coverage.
  - `ts/packages/incubating/infra/gitplane/node_modules/ulid/README.md` — locally installed upstream usage/provenance documentation while the experiment remains installed.
  - `ts/packages/incubating/infra/gitplane/node_modules/ulid/LICENSE` — upstream ULID license attribution source.
  - `ts/packages/incubating/infra/gitplane/node_modules/@scure/base/index.js` — locally installed upstream Crockford Base32 implementation source.
  - `ts/packages/incubating/infra/gitplane/node_modules/@scure/base/LICENSE` — upstream Base32 license attribution source.

## Useful Commands / Files

- `git diff -- ts/packages/incubating/infra/gitplane ts/pnpm-workspace.yaml ts/pnpm-lock.yaml` — inspect the incomplete dependency experiment.
- `rg -n 'ulid|base32crockford|crockfordBase32Lower' ts/packages/incubating/infra/gitplane ts/pnpm-workspace.yaml ts/pnpm-lock.yaml` — inventory all temporary dependency and codec references.
- `pnpm --dir ts --filter @nseng-ai/gitplane test`
- `pnpm --dir ts --filter @nseng-ai/gitplane check`
- `just ts-deps-check && just ts-test-integration && just ts-format-check && just ts-lint && just ts-check && just ts-test-typescript-style-guard && just`
- PR #4064: https://github.com/nseng-ai/ns/pull/4064
