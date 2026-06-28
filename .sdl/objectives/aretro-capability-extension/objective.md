# Aretro Capability Extension

## Thesis

Aretro should be modeled deliberately as an SDL Capability in the extension architecture endgame while preserving its existing product boundary: deterministic, privacy-conscious branch retrospective evidence for the `branch-retro` skill and other language-model workflows. The migration should decide and implement Aretro's command face and any necessary Capability API without moving semantic retrospective judgment into the deterministic CLI.

This Objective is a child of `sdl-extension-architecture` Phase 2 row 4. It applies ADR 0009 / ADR 0012 layering to `@sdl/aretro`: capability domain belongs in the Aretro package, command shells convert host/CLI context into injected gateways at the edge, consumers use curated supported surfaces only, and no Aretro domain should move into the SDL kernel, the Pi presentation host, `ccc`, or `@sdl/domain-primitives-transitional`.

## Scope

- Inventory the current Aretro implementation and consumer boundary, including `ts/packages/aretro`, `docs/aretro.md`, the `branch-retro` skill/runner, package exports, standalone `aretro` bin usage, tests, and any Pi/CCC/SDL references.
- Decide Aretro's command-face strategy for the extension architecture:
  - whether the durable human/agent surface remains standalone `aretro exec ...`, becomes mounted through an SDL command face such as `sdl aretro ...`, or uses a transitional/dual shape with an explicit cutoff;
  - how the command face is implemented without making the SDL kernel own Aretro domain logic.
- Decide whether Aretro needs a curated Capability API subpath (`@sdl/aretro/api`) now.
  - Add one only if an in-process consumer needs typed Aretro behavior.
  - If no such consumer exists, record the command-face-only disposition and keep package exports from implying a broad peer API.
- Preserve the Aretro evidence/judgment split:
  - Aretro collects compact factual observations and sanitized payload details;
  - `branch-retro` or another model-backed workflow interprets the evidence and writes human-facing recommendations.
- Ensure Aretro's domain core stays gateway-/source-injected and fake-testable for git, session-source, filesystem/payload, and process boundaries.
- Update Aretro docs/context and parent Objective tracking with the final capability disposition.

## Non-Goals

- Do not add semantic diagnoses, quality judgments, recommendations, scoring, dashboards, or branch-improvement prose to the Aretro CLI or core.
- Do not expose raw transcript text, prompts, assistant prose, tool output, or unbounded command output in compact evidence.
- Do not create a Capability API merely because ADR 0009 names the convention; Aretro should expose `@sdl/aretro/api` only when a concrete in-process consumer needs it.
- Do not make `ccc`, `@sdl/pi`, or the SDL kernel own Aretro domain logic.
- Do not introduce a dependency on `@sdl/domain-primitives-transitional`; this child should help retire transitional debt, not expand it.
- Do not publish packages, preserve checkout-free registry execution, or change external distribution without separate explicit confirmation.
- Do not redesign the `branch-retro` product experience beyond the command/API boundary needed for capability layering.

## Completion Criteria

- Aretro has an explicit capability-layer disposition consistent with ADR 0009 / ADR 0012 and the parent `sdl-extension-architecture` Objective.
- The supported command face is documented and tested, including any hard cutover or compatibility decision between standalone `aretro ...` and SDL-mounted command usage.
- Aretro either exposes a curated `@sdl/aretro/api` subpath for a proven in-process consumer or records that no Capability API is currently needed.
- Package exports and sibling consumers do not rely on broad roots, private/deep imports, or presentation-host domain imports for Aretro behavior.
- Aretro domain behavior remains package-owned and gateway-/source-injected, with ordinary tests using fakes rather than real session logs or external services.
- The evidence/judgment boundary remains intact and documented.
- Parent `sdl-extension-architecture` tracking records Aretro as completed or deliberately dispositioned, with any follow-up parked clearly.

## Definition of Progress

Progress is keepable when it clarifies or implements Aretro's capability boundary without changing the privacy/evidence contract accidentally. Useful slices include current-boundary inventory, command-face decision and implementation, Capability API disposition, gateway/core cleanup, package export cleanup, docs/context refresh, and parent Objective update.

Do not keep changes that broaden Aretro's product semantics, expose raw transcript/command content, create unsupported in-process APIs, add new cross-capability cycles, or move Aretro domain into kernel/host/orchestration packages.

Useful evidence includes source searches for Aretro imports/commands, focused `@sdl/aretro` tests/checks, command-shape scenario tests, style-guard/import-boundary checks where package exports change, and Semantic Updates in this child and the parent when decisions land.

## Runner Policy

This Objective is execution-friendly after a preview for one bounded Aretro capability slice.

- Direct execution is allowed for inventory, docs/context updates, package export changes, command-face wiring, fake-driven gateway/core cleanup, and Objective tracking that stays within the previewed Aretro capability boundary.
- Steer first before changing the public command name strategy, adding or omitting a `@sdl/aretro/api` Capability API as a durable product decision, changing the evidence/judgment boundary, adding new evidence kinds, or preserving/removing standalone `aretro` compatibility.
- Work may edit repo-local TypeScript, tests, docs/context files, skills/branch-retro integration, and Objective tracking. Work may be left as local file changes.
- Validation should include targeted `@sdl/aretro` checks/tests and any import-boundary/style guard relevant to touched files. Full repo validation is evidence, not a standalone roadmap row.
- The runner must not publish packages, push, submit PRs, mutate GitHub, or call external write APIs unless explicitly confirmed.

## Assumptions and Risks

Assumptions:

- Aretro remains a deterministic evidence capability; semantic retrospective interpretation remains outside Aretro.
- The existing TypeScript package already has useful injectable seams (`git`, `sessionSource`, payload/detail operations) that should be refined rather than replaced wholesale.
- A Capability API may be unnecessary if `branch-retro` remains a skill/CLI consumer instead of an in-process package consumer.
- A command-face change may overlap with CLI surface conformance work; coordinate with that Objective instead of silently broadening either scope.

Risks:

- Treating `@sdl/aretro`'s broad root export as a Capability API could accidentally freeze too much implementation surface.
- Forcing Aretro under `sdl ...` too early could break the `branch-retro` runner or active docs that intentionally use standalone `aretro exec collect-evidence`.
- Capability migration could tempt moving interpretation into the CLI; that would violate Aretro's privacy-conscious evidence boundary.
- Tests that read real operator session logs would create brittle or privacy-sensitive validation; ordinary confidence should come from fakes and sanitized smoke evidence.

## Open Questions

- Should the durable command face remain standalone `aretro`, move to `sdl aretro`, or use a documented transition?
- Is there a concrete in-process consumer that justifies `@sdl/aretro/api`, or should Aretro be command-face-only for now?
- Which root exports, if any, should stay public after the Capability API decision?
- Does `branch-retro` need any runner or docs change once the command-face disposition is chosen?

## Closure

Closed as completed. The Objective produced an explicit Aretro capability-layer disposition: hard-cutover to the SDL command face (`sdl aretro exec collect-evidence` and `sdl aretro exec read-evidence-detail`) through the project-local Aretro SDL extension, with Aretro domain logic remaining package-owned.

The Capability API decision is command-face-only for now. No `@sdl/aretro/api` subpath was added because inventory found no in-process consumer, and `ts/packages/aretro/package.json` now avoids a broad root export or standalone bin in favor of explicit SDL command module subpaths.

The implementation preserved the privacy-conscious evidence/judgment boundary: Aretro continues to emit deterministic factual evidence and sanitized payload details, while `branch-retro` remains responsible for semantic retrospective interpretation. The `branch-retro` skill now invokes `sdl aretro exec ...` directly, and docs/context/package README/parent Objective tracking were refreshed to record the final command/API boundary.

Validation evidence recorded during the completing slice:

- `pnpm --dir ts --filter @sdl/aretro run test`
- `pnpm --dir ts --filter @sdl/aretro run check`
- `pnpm --dir ts exec vitest run --config vitest.integration.config.ts packages/kernel/test/integration/aretro-extension-cli.test.ts`

No Aretro Capability API follow-up remains open without a concrete in-process consumer. Broader CLI conformance findings for Aretro result/error shapes remain separate CLI-UX work, and parked future scope remains outside this Objective: new evidence kinds or deterministic recommendations, registry/checkout-free distribution, dynamic Pi mirrors, and shared evidence/session foundations before a second consumer proves reuse.
