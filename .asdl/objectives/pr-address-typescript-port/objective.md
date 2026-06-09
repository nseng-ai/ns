# Port pr-address to TypeScript

## Thesis

`pr-address` should become TypeScript-backed by default as the first production vertical slice of the broader asdl toolkit migration. The port should preserve the existing public skill, CLI, JSON, wrapper, and safety contracts while replacing Python implementation internals with idiomatic, testable TypeScript.

This slice should prove migration patterns that later capability ports can reuse: command runtime shape, boundary schemas, gateway seams, golden and scenario parity, wrapper distribution, installed-skill behavior, and safe Python fallback retirement.

## Scope

- Public `pr-address` skill invocation and wrapper behavior in both local-checkout and installed-skill contexts.
- Standalone `pr-address` CLI compatibility and the expected `asdl pr-address ...` integration path, including `pr-address exec ... --format json` machine envelopes.
- Current operation families: PR feedback preparation and fetching, payload artifact management, classification scaffold/validation/planning, selected detail lookup, batch checkpointing, stack feedback planning and diff helpers, resolve/reply payload builders, GitHub mutation helpers, and finalization.
- Adapter-neutral TypeScript core logic with gateway boundaries for git, GitHub, filesystem, process, package/distribution, and other external behavior the later port needs.
- Scenario, golden, and contract parity evidence sufficient to preserve stable behavior while identifying accidental Python implementation details.
- Fake-driven tests with capability-shaped gateways, plus limited safe real-adapter smoke evidence for read-only or non-mutating paths where useful.
- npm/pnpm distribution and wrapper local/prod detection once TypeScript becomes the default implementation path.
- Short, explicit Python fallback retirement after TypeScript default behavior is proven.

## Non-Goals

- No user-facing `pr-address` workflow redesign by default.
- No blind module-for-module port of `asdl_pr_address` or Python `asdl-core`.
- No TypeScript package scaffolding in the Objective-creation branch.
- No direct browser compatibility requirement for workflows that depend on local git, shell, filesystem, or authenticated GitHub state.
- No long-term Python fallback after cutover criteria are met.
- No replacement of semantic LLM judgment with brittle deterministic review-comment classification.

## Completion Criteria

- Current public `pr-address` CLI, skill, JSON, wrapper, documentation, and safety contracts are inventoried and classified as durable contract versus incidental Python behavior.
- A TypeScript implementation becomes the default for public `pr-address` invocation in local-checkout and installed-skill contexts.
- The standalone CLI, expected plugin/asdl integration path, JSON envelopes, payload artifact behavior, validation-before-action semantics, mutation-helper safety rules, and no-push guarantee are preserved or intentionally changed with explicit compatibility rationale.
- Fake-driven unit and scenario tests, golden/contract parity, wrapper checks, and limited safe real-adapter smoke evidence cover the migration.
- Public skill docs, wrapper behavior, README/developer docs, and distribution instructions point to TypeScript/npm paths.
- Python fallback has a short explicit retirement phase and is then deleted, archived, or removed from active invocation paths.
- Lessons from the `pr-address` port feed back into the umbrella porting playbook for later capability slices.

## Assumptions and Risks

Assumptions:

- Stable `pr-address` contracts can be preserved through JSON envelope checks, scenario tests, golden fixtures, and compatibility-focused wrapper tests.
- The current TypeScript workspace is the right default home for the port: pnpm workspaces, Node ESM, strict TypeScript, and Vitest.
- Existing Python tests and docs are useful contract sources, but some fixtures or formatting details may encode accidental implementation behavior.
- A vertical-slice migration will reveal better shared command runtime and gateway abstractions than pre-porting Python `asdl-core` as a module map.
- Compatibility-preserving TypeScript internals can still add cleaner TS-native APIs behind or alongside stable public contracts where useful.

Risks:

- Shared command-runtime work could overfit to `pr-address` if extracted before repeated seams are proven.
- Skill or wrapper semantics could change accidentally, especially local/prod detection, payload defaults, mutation-helper ownership, or no-push guarantees.
- Keeping Python fallback too long could create duplicate maintenance and obscure which path is authoritative.
- Deleting Python too early could remove a useful rollback/reference path before contract parity is mature.
- npm distribution, package binaries, and installed-skill execution may expose surprises not visible in the current `uv`/`uvx` flow.
- GitHub mutation safety could regress if helper boundaries or validation-before-action semantics are weakened.
- Stack-feedback behavior may be more complex than current scenario coverage shows.

## Open Questions

- What TypeScript package name and public/private boundary should own `pr-address`?
- How should `asdl pr-address ...` plugin compatibility be preserved or replaced in a TypeScript-first world?
- Which current golden outputs are durable contract versus incidental formatting?
- What is the shortest safe Python fallback retirement window?
- Which shared command-runtime pieces should be extracted only after a second capability proves the same seam?
