# Port areg to TypeScript

## Thesis

Port the standalone `areg` package and CLI from Python to idiomatic TypeScript so agent-resource and skill-management workflows join the rest of the first-party toolkit migration while preserving current user-facing and agent-facing contracts.

This Objective intentionally overrides the default capability order in the parent Synthesis Objective, `port-asdl-toolkit-to-typescript`, where `areg` was parked pending evidence. The override is justified by current interest in making `areg` TS-default now, but it should still follow the established capability-porting playbook: inventory contracts first, port vertical slices, keep seams local until reuse is proven, make distribution a product decision, and retire Python intentionally.

The port should cover the active `areg` surfaces: `areg init`, `areg check`, `areg update-skills`, the skill invocation kinds system specified by the Objective-local reference doc `skill-invocation-kinds.md`, and hidden `areg exec skillx parse|list|fetch|cleanup`. PR #1510 remains prototype/provenance evidence for the kinds work. Legacy `areg command convert|revert|list` behavior should no longer be tracked as a standalone porting row or final compatibility surface. The package should remain a standalone `areg` CLI unless a separate explicit decision changes the product surface.

## Scope

- Create a TypeScript `areg` workspace package under the existing `ts/` workspace using the repo's Node ESM, pnpm, strict TypeScript, and Vitest defaults.
- Preserve the current standalone CLI identity and user-facing command contracts for:
  - `areg init`
  - `areg check`
  - `areg update-skills`
  - `areg skill apply`, `areg skill list`, and `areg skill show` as specified by Objective-local `skill-invocation-kinds.md`
  - hidden `areg exec skillx parse`, `list`, `fetch`, and `cleanup`
- Preserve the current agent-facing JSON contracts for hidden `exec skillx` helpers unless the contract inventory classifies a field or shape as incidental and records an accepted divergence.
- Preserve current skill-management behavior around `.agents/skills`, `.claude/skills`, `skills-lock.json`, `asdl.toml` `[areg].agents`, legacy `areg.json` fallback where still supported, managed instruction blocks, and local skill validation.
- Preserve external boundaries as fake-driven TypeScript gateways for Git-root discovery, host tool availability, `gh api`, `npx skills add`, transient skillx workspaces, filesystem mutation, and project configuration reads/writes.
- Use an immediate checkout-local TypeScript invocation path for `areg` cutover, rather than waiting on npm-style external distribution or preserving Python `uvx` packaging.
- Update public docs, skill prose, install recipes, workspace metadata, and relevant repo tooling so normal repo development and CI invocation use the TypeScript implementation by default.
- Retire the active Python `packages/areg` path now that TS parity is evidenced, after caller migration and rollback/reference evidence are recorded.
- Record the out-of-sequence selection and any reusable lessons back into the parent TypeScript migration Objective.

## Non-Goals

- Do not redesign `areg` as a top-level `asdl` plugin or rename the public command during this Objective.
- Do not broaden the Objective into a redesign of the upstream `npx skills` CLI or the external skills distribution model.
- Do not port unrelated Python packages, skill content, or Objective workflow code as part of this `areg` slice.
- Do not preserve Python implementation modules as a long-term fallback after `areg` becomes TS-default.
- Do not add shared TypeScript framework abstractions solely to mirror Python module boundaries; extract to shared packages only when a second consumer proves the seam.
- Do not turn routine validation into standalone roadmap work. Tests and repo checks are completion evidence for semantic rows.

## Completion Criteria

- The parent `port-asdl-toolkit-to-typescript` Objective records that `areg` was intentionally promoted from parked status and selected out of the default sequence.
- A contract inventory distinguishes durable `areg` CLI, JSON, file-layout, managed-block, skill-lock, project-config, and external-tool behavior from incidental Python implementation details.
- A TypeScript `areg` package exists in the `ts/` workspace with fake-driven unit/scenario coverage for every current command surface.
- `areg exec skillx parse|list|fetch|cleanup` produce the accepted machine-readable contracts and preserve safety behavior around transient workspace cleanup.
- `areg check` enforces the accepted skill-layout, lockfile, invoke-only, pairing, orphan, and source-structure conventions through TypeScript code.
- `areg init` preserves the accepted project-bootstrap behavior, including Git-root checks, managed instruction blocks, bootstrap skills, agent resolution, non-destructive config handling, and fake-backed external `npx skills` installation.
- `areg update-skills` preserves the curated-lockfile workaround for upstream `npx skills update` behavior until that workaround is explicitly retired.
- The Objective-local `skill-invocation-kinds.md` system is reimplemented in TypeScript, including artifact-inferred `normal`, `invoke-only`, `command-backed`, `ambient-only`, `mixed`, and `inconsistent` kinds, Pi replacement verification for command-backed skills, status/list/show reporting, `areg check` diagnostics, and docs/tests for the flattened surface.
- Public docs, skills, just recipes, package metadata, and install instructions point at the TypeScript-backed `areg` path for repo-local use.
- Python `packages/areg` is deleted, archived, or otherwise removed from active paths after rollback/reference evidence is recorded.
- The parent migration ledger and porting playbook capture any reusable `areg` lessons or sequencing rationale needed by later capability ports.

## Assumptions and Risks

Assumptions:

- `areg` has enough current strategic value to override the default migration order even though it was previously parked pending evidence.
- The durable product surface is the standalone `areg` CLI, not an `asdl` plugin or renamed command group.
- Historical Python behavior after the completed nonslop migration and review remediation was sufficient reference for contract inventory and is no longer an active implementation fallback.
- TypeScript gateway/fake boundaries preserved the review-remediated safety properties without copying Python module structure directly.
- The existing TypeScript workspace foundations, especially `@asdl/clinkr` and `@asdl/core` where appropriate, were mostly sufficient; the skill-kind apply slice proved one small shared Clinkr extension was warranted for final variadic positionals, while areg-specific mutation seams remain package-local unless reuse is proven.
- `npx skills add`, `gh api`, and Git-root/tool checks remain external command boundaries rather than embedded service clients for this port.

Risks:

- The prior ledger-drift risk from overriding the parent migration order is resolved: the umbrella Objective now records the completed `areg` cutover and reusable lessons.
- `areg init` mutates multiple project files and invokes `npx skills`; the TypeScript implementation de-risks this with planning/mutation seams, fake-driven coverage, and real adapter path/symlink revalidation.
- The hidden `exec skillx` JSON shapes may be consumed by skills or Pi flows; the accepted TypeScript contract is Clinkr JSON envelopes with operation payloads under `data`, and live skill guidance now documents the TS invocation path.
- The kind system edits local skills, Codex sidecars, and Pi replacement settings, so destructive path, symlink, artifact-inference, and replacement-verification edge cases remain important; the completed apply slice materially de-risks them with package-local planning, real/fake gateway safety tests, dry-run behavior, and deletion confirmation gates.
- Post-kind review evidence identified drift risk from duplicated skill-artifact inspection, kind/check invariant classification, Pi settings parsing, frontmatter handling, and apply-plan seams. Blocker triage found no issue that needed to keep Python alive; broader architecture cleanup is parked.
- The immediate distribution decision is repo-local TypeScript invocation from the `ts/` workspace. External installed use, npm-style packaging, and Python `uvx areg` replacement remain follow-up distribution questions, not blockers after Python removal from this repo.
- Historical Click/Python formatting remains reference/provenance only; active repo-local behavior follows the TypeScript command framework and recorded accepted divergences.

## Open Questions

- Resolved for this Objective: repo-local TypeScript invocation plus `just install-areg` / `install-tools` shims are the accepted distribution model for the cutover. External installed use, npm-style execution, checkout-free packaging, or Python `uvx areg` replacement remains a parked future product decision, not a reason to preserve Python.
- Parked follow-up: should `areg` keep legacy `areg.json` fallback indefinitely, or should a later cleanup define a retirement path in favor of `asdl.toml` `[areg].agents`? The TypeScript port preserves legacy `areg.json` fallback behavior where scoped for this Objective.
- Resolved for this Objective: TypeScript `@asdl/clinkr` command-framework behavior is accepted for non-durable Click/help/usage-byte details; durable command, JSON, file-layout, managed-block, lockfile, and safety behavior is covered by the contract inventory and tests.
- Resolved for this Objective: reusable skill-lock, project-config, managed-block, and skill-layout validation seams remain package-local until a second TypeScript consumer proves extraction.

## Closure

Completed. `areg` is TypeScript-default for repo-local use and for the active first-party standalone CLI surface: `areg init`, `areg check`, `areg update-skills`, flattened `areg skill apply|list|show`, and hidden `areg exec skillx parse|list|fetch|cleanup` are implemented in `ts/packages/areg` with fake-driven scenario/unit/gateway coverage.

The accepted cutover/distribution state is repo-local TypeScript invocation from the `ts/` workspace plus the `just install-areg` / `install-tools` shim. `justfile`, CI, public repo-local callers, skill guidance, and hidden `exec skillx` guidance use the TypeScript path, and runtime diagnostics report `runtime: typescript` for both direct source invocation and the installed `areg` shim path.

The Python fallback is retired: tracked `packages/areg` files are gone, uv workspace/dev dependency/source configuration no longer includes `areg`, Python lint/type/test configuration no longer includes `packages/areg`, and empty untracked `packages/areg` directories were removed during closure verification. Rollback/reference evidence for the deleted Python implementation is in-repo commit `18f25c34720f2422881afe93084d569f0d071dfd`, the parent of deletion commit `eb5785fc3`.

Closure evidence includes the completed roadmap rows, Semantic Updates `updates/2026-06-15T191151Z-areg-typescript-cutover-complete.md` and `updates/2026-06-16T010915Z-areg-ts-cutover-python-removal.md`, parent Semantic Updates `port-asdl-toolkit-to-typescript/updates/2026-06-15T191151Z-areg-cutover-and-playbook-lessons.md` and `port-asdl-toolkit-to-typescript/updates/2026-06-16T012156Z-areg-cutover-playbook-lessons.md`, and the parent `porting-playbook.md` lessons.

Caveats and follow-ups: broader post-migration CLI cleanup is tracked separately in `.asdl/objectives/areg-ts-cli-cleanup/`; external installed distribution beyond repo-local shims remains a future product decision; no reusable areg-specific validation or mutation seam is promoted to shared TypeScript packages without a second consumer. The parent `port-asdl-toolkit-to-typescript` Objective records `areg` as the completed out-of-sequence cutover and resumes the default next capability as `objective` unless new evidence changes the sequence.
