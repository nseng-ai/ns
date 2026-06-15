# Port areg to TypeScript

## Thesis

Port the standalone `areg` package and CLI from Python to idiomatic TypeScript so agent-resource and skill-management workflows join the rest of the first-party toolkit migration while preserving current user-facing and agent-facing contracts.

This Objective intentionally overrides the default capability order in the parent Synthesis Objective, `port-asdl-toolkit-to-typescript`, where `areg` was parked pending evidence. The override is justified by current interest in making `areg` TS-default now, but it should still follow the established capability-porting playbook: inventory contracts first, port vertical slices, keep seams local until reuse is proven, make distribution a product decision, and retire Python intentionally.

The port should cover the active `areg` surfaces: `areg init`, `areg check`, `areg update-skills`, the skill invocation kinds system specified by the Objective-local reference doc `skill-invocation-kinds.md`, and hidden `areg exec skillx parse|list|fetch|cleanup`. PR #1510 remains prototype/provenance evidence for the kinds work. Legacy `areg command convert|revert|list` behavior should no longer be tracked as a standalone porting row; if compatibility aliases remain, they belong inside the kind-model slice. The package should remain a standalone `areg` CLI unless a separate explicit decision changes the product surface.

## Scope

- Create a TypeScript `areg` workspace package under the existing `ts/` workspace using the repo's Node ESM, pnpm, strict TypeScript, and Vitest defaults.
- Preserve the current standalone CLI identity and user-facing command contracts for:
  - `areg init`
  - `areg check`
  - `areg update-skills`
  - `areg skill kind set`, `areg skill kind list`, and `areg skill kind show` as specified by Objective-local `skill-invocation-kinds.md`
  - compatibility handling for legacy `areg command convert`, `areg command revert`, and `areg command list` only insofar as the kinds specification requires it
  - hidden `areg exec skillx parse`, `list`, `fetch`, and `cleanup`
- Preserve the current agent-facing JSON contracts for hidden `exec skillx` helpers unless the contract inventory classifies a field or shape as incidental and records an accepted divergence.
- Preserve current skill-management behavior around `.agents/skills`, `.claude/skills`, `skills-lock.json`, `asdl.toml` `[areg].agents`, legacy `areg.json` fallback where still supported, managed instruction blocks, and local skill validation.
- Preserve external boundaries as fake-driven TypeScript gateways for Git-root discovery, host tool availability, `gh api`, `npx skills add`, transient skillx workspaces, filesystem mutation, and project configuration reads/writes.
- Decide and document the accepted TypeScript distribution/install model for `areg`, rather than inheriting Python `uvx` or previous run-from-source shims automatically.
- Update public docs, skill prose, install recipes, workspace metadata, and relevant repo tooling so normal development and installed invocation use the TypeScript implementation by default.
- Retire the active Python `packages/areg` path only after TS parity, caller migration, and rollback/reference evidence are recorded.
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
- The Objective-local `skill-invocation-kinds.md` system is reimplemented in TypeScript, including artifact-inferred `normal`, `invoke-only`, `command-backed`, `ambient-only`, `mixed`, and `inconsistent` kinds, Pi replacement verification for command-backed skills, status/list/show reporting, `areg check` diagnostics, docs/tests, and required legacy `areg command` compatibility aliases.
- Public docs, skills, just recipes, package metadata, and install instructions point at the TypeScript-backed `areg` path.
- Python `packages/areg` is deleted, archived, or otherwise removed from active paths after rollback/reference evidence is recorded.
- The parent migration ledger and porting playbook capture any reusable `areg` lessons or sequencing rationale needed by later capability ports.

## Assumptions and Risks

Assumptions:

- `areg` has enough current strategic value to override the default migration order even though it was previously parked pending evidence.
- The durable product surface is the standalone `areg` CLI, not an `asdl` plugin or renamed command group.
- Current Python behavior after the completed nonslop migration and review remediation is the best reference for contract inventory.
- TypeScript gateway/fake boundaries can preserve the review-remediated safety properties without copying Python module structure directly.
- The existing TypeScript workspace foundations, especially `@asdl/clinkr` and `@asdl/core` where appropriate, are sufficient for the first slices; missing seams should start package-local unless reuse is proven.
- `npx skills add`, `gh api`, and Git-root/tool checks remain external command boundaries rather than embedded service clients for this port.

Risks:

- Overriding the parent migration order could create ledger drift if the umbrella Objective is not updated early and again at cutover.
- `areg init` mutates multiple project files and invokes `npx skills`; a direct port could regress the previous review-remediation safety work if planning/mutation and fake-driven gateway seams are not preserved.
- The hidden `exec skillx` JSON shapes may already be consumed by skills or Pi flows; accidental schema changes could break agent workflows.
- The kind system edits local skills, Codex sidecars, and Pi replacement settings, so a shallow CLI parity pass could miss destructive path, symlink, artifact-inference, or replacement-verification edge cases.
- Distribution is less obvious than prior ports: `areg` documentation still references `uvx areg`, while prior TS ports accepted run-from-source shims only after consumer evidence. Choosing the wrong model could surprise downstream project bootstrap users.
- Current tests may encode both durable contracts and incidental Click/Python formatting behavior; the inventory must classify parser/help/output differences deliberately.

## Open Questions

- What TypeScript distribution model should `areg` use after cutover: run-from-source shim, npm-style package execution, both, or another documented model?
- Should `areg` keep legacy `areg.json` fallback indefinitely, or should the TS port define a retirement path in favor of `asdl.toml` `[areg].agents`?
- Which current Click/help/usage-byte behaviors are durable enough to preserve exactly, and which should adopt the TypeScript command framework's standard behavior?
- After `areg` becomes TS-default, should any reusable skill-lock, project-config, managed-block, or skill-layout validation seams move into shared TypeScript packages, or remain package-local?
