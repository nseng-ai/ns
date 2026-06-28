# Roaster Capability Extension

## Thesis

Roaster should become an SDL Capability above the thin SDL kernel: its review catalog, local-diff review execution, findings recording/publication, review-log storage, and review-skill discovery should remain Roaster-owned domain behavior, exposed through a thin SDL Command Face and a curated `@sdl/roaster/api` only where in-process consumers need it. At Objective start, the TypeScript gateway-oriented package was still surfaced as a standalone `roaster` CLI package with selected root exports and public skills/docs that invoked the binary directly; the migration records the cutover from that standalone tool shape to Capability shape without changing Roaster's product semantics.

This Objective is a child of `sdl-extension-architecture` Phase 2. It follows ADR 0009 / 0012 / 0016 vocabulary: Roaster is an above-SDK Capability, `@sdl/capability-kit` is the shared above-SDK substrate, the SDL kernel remains small, and consumers must depend on `@sdl/roaster/api` rather than package internals. Roaster's existing domain is review-only by default: it runs configured PR-diff checks and emits findings; remediation, Objective evidence, review-thread addressing, and arbitrary PR workflow orchestration remain outside Roaster unless a later Objective explicitly adds them.

## Scope

- Inventory the current Roaster surface area across `ts/packages/roaster/**`, `.sdl/reviews/**`, Roaster-related public skills, Pi command-surface metadata, docs, install/shim references, and package exports.
- Define the desired Roaster Capability boundary: Domain Core, Command Face, optional `@sdl/roaster/api` Capability API, presentation/skill responsibilities, Branch Memory review-log storage, and GitHub publication boundaries.
- Add or narrow `@sdl/roaster/api` as the curated typed consumer surface when a sibling package or host needs Roaster behavior in-process. Package roots and private source modules should not become the Capability API by accident.
- Model Roaster's user-facing command surface as an SDL command contribution, preserving the existing review operations intentionally: `review list`/`ls`, `review run`, `review log`, `roast list`, and hidden automation operations for recording/publishing findings unless a steer-first decision changes the command taxonomy.
- Keep Roaster's domain core gateway-injected. Existing gateways for git/local diff, review catalog, review log, GitHub publication, and review runners should stay fake-testable; command shells should adapt host context to gateways rather than passing raw SDL extension context into domain logic.
- Align public skills and Pi metadata over the chosen command face while preserving user-facing review-skill names such as `roast-thermonuclear-review` and the semantics of `.sdl/reviews/<key>.md` review definitions.
- Record the standalone `roaster` binary disposition after SDL parity is proven: hard-cut like completed child capability migrations, or retain only with an explicit compatibility exception if external tool ergonomics require it temporarily.
- Update Roaster, SDL, Pi, context, docs, and parent Objective tracking so future agents can discover the Capability API, Command Face, Domain Core, storage boundary, and any parked follow-up work.

## Non-Goals

- Do not change Roaster's review-definition format, `.sdl/reviews/<key>.md` catalog location, model-profile semantics, or Tripwire/Deep review terminology without an explicit steer-first decision.
- Do not make Roaster an editing/remediation agent. Roaster runs reviews, records review logs, and can publish findings; code modification workflows belong to other capabilities or future Objectives.
- Do not alter Branch Memory review-log namespace/key semantics (`roaster`, `reviews/<review-key>/...`) or stored review-log meaning without explicit compatibility approval.
- Do not expand the SDL public author SDK (`sdl-sdk`) for Roaster convenience. Shared host-to-gateway adaptation belongs in `@sdl/capability-kit`; Roaster-specific behavior belongs in Roaster.
- Do not introduce dynamic arbitrary Pi mirroring, skill installation/marketplace behavior, or generated agent-resource management in this Objective.
- Do not migrate PR Address, Aretro, CCC, or the older `roaster stack` Graphite workflow as part of this Objective. Existing closed Roaster Objectives remain provenance, not active scope.
- Do not perform live GitHub PR comment publication or other external writes as validation unless the user explicitly confirms that action in the preview scope.

## Completion Criteria

- Roaster has a documented Capability shape: gateway-injected Domain Core, thin SDL Command Face, and a curated `@sdl/roaster/api` surface where in-process consumers need it.
- Roaster command behavior is reachable through SDL's extension command system with side-effect-light discovery and selected command loading, while preserving intentional review/list/log/record/publish semantics.
- Public skills/docs/Pi metadata that invoke Roaster are aligned with the chosen command face and no longer teach stale standalone-only assumptions.
- The standalone `roaster` binary has an explicit recorded disposition after SDL parity evidence: removed/cut over, or retained only with a documented compatibility reason and follow-up.
- Roaster storage compatibility is preserved: review definitions remain catalog entries, review logs remain Branch Memory records in the `roaster` namespace under `reviews/<review-key>/...`, and findings publication remains a guarded GitHub boundary.
- Roaster package docs/context explain the Capability API, Command Face, Domain Core, review-log storage, skill boundary, and `@pierre/diffs` parser boundary without turning Roaster into a remediation workflow.
- Parent Objective `sdl-extension-architecture` can record Roaster as a completed child migration, leaving PR Address, Aretro, CCC clean-consumer work, and transitional-package deletion to their own slices.

## Definition of Progress

Progress is keepable when it:

- moves Roaster toward the ADR 0009 Capability model without changing review semantics accidentally;
- proves or documents one command/API/storage boundary through fake-backed tests, command-scenario tests, import-boundary searches, or context/docs updates;
- preserves Roaster's read-only review-run behavior by default and keeps GitHub publication explicit, tested, and guarded;
- narrows public consumer imports to `@sdl/roaster/api` where an in-process consumer exists, instead of relying on package roots or private source modules;
- records architecture decisions and follow-ups in this Objective, Roaster context/docs, or parent tracking when the migration changes durable meaning.

Do not keep changes that:

- silently alter review-definition catalog behavior, review-log storage, model/profile selection, finding schemas, or publication semantics;
- add Roaster domain logic to the SDL kernel, Pi presentation host, or below-SDK neutral infra;
- expose private Roaster implementation modules as public API because one consumer is convenient;
- leave two durable public implementations of the same Roaster command behavior without a recorded compatibility reason;
- mutate real GitHub PR comments, Branch Memory entries, or external systems as validation without explicit user confirmation.

Useful evidence includes targeted Roaster package tests, fake-gateway Domain Core tests, SDL command discovery/selected-loading scenarios, import-boundary searches, storage compatibility searches, skill/docs/context diffs, and relevant TypeScript package checks for touched packages.

## Runner Policy

This Objective is execution-friendly for `objective-next` under the boundaries below.

- Direct execution is allowed after a preview for bounded slices such as current-surface inventory, adding/narrowing `@sdl/roaster/api`, extracting or documenting gateway-injected Roaster core seams, proving SDL command-face loading for one Roaster command group, aligning skills/docs/Pi metadata, and recording standalone CLI disposition once parity evidence is available.
- Use existing SDL grouped-command mechanics as the default command-face path unless implementation evidence proves they are insufficient. Steer first before changing public Roaster command taxonomy, adding a new SDL manifest schema, expanding `sdl-sdk`, or retaining/removing the standalone binary contrary to the parity evidence.
- Preserve current review semantics by default: review definitions remain under `.sdl/reviews`, review runs are read-only except for additive review-log writes, `record-findings` records same-session findings, and `publish-findings` is the explicit GitHub publication boundary.
- Work may edit repo-local TypeScript, package metadata, tests, docs/context files, skills, Pi command metadata/adapters, SDL command infrastructure when needed for the bounded slice, and Objective tracking. Work may be left as local file changes on the current branch after the confirmed slice.
- Validation before keeping work should include targeted checks for touched packages and import/storage searches relevant to the slice. Full `just` is useful evidence for broad command-system or cutover slices but is not a standalone roadmap row.
- Stop and ask before changing review-definition format, Branch Memory storage compatibility, public skill names, live GitHub publication behavior, dynamic Pi mirroring, public SDK author API, or any external write-capable validation. The runner must not push, submit, land, publish packages, mutate GitHub issues/PRs, or call external write APIs unless the user explicitly includes that action in the confirmed preview scope.

## Assumptions and Risks

Assumptions:

- Roaster is an above-SDK Capability even though its current TypeScript package already has a standalone CLI and gateway abstractions; the migration work is command/API/product-boundary alignment, not a rewrite from scratch.
- The existing review-run core, local-diff gateway, review catalog, review log, GitHub publication gateway, and review runner boundaries are good starting points for a gateway-injected Domain Core.
- A curated `@sdl/roaster/api` may be narrower than the current package root exports; it should be driven by concrete in-process consumers rather than exposing every existing helper.
- Existing public skills that say `roaster review run <key>` are user-facing review wrappers and should keep their skill names; their underlying invocation guidance can move to the SDL command face when parity exists.
- The `@pierre/diffs` dependency and documented parser boundary are orthogonal to Capability migration; do not revisit parser semantics unless Roaster behavior itself requires it.

Risks:

- The standalone `roaster` binary may have external habits or scripts not visible in repo-local searches. Mitigate by inventorying call sites and recording any compatibility exception before removal.
- GitHub findings publication is write-capable and currently hidden automation surface. Mitigate by using fake-backed tests and refusing live publication validation unless explicitly confirmed.
- Roaster review logs are Branch Memory entries used as durable review evidence. Mitigate by preserving namespace/key semantics and testing fake review-log behavior before changing command faces.
- Existing package root exports may already be consumed as de facto API. Mitigate by source-searching and moving consumers deliberately to `@sdl/roaster/api` rather than deleting exports blindly.
- Roaster can be confused with remediation or PR-addressing workflows. Mitigate by keeping terminology clear: Roaster emits findings and review logs; other workflows decide how to address them.

## Open Questions

- Should the durable public command face become `sdl roaster ...`, `sdl roast ...`, or another grouped SDL shape that preserves current `review`/`roast` subgroups? Default to preserving current user vocabulary unless the first inventory finds a better command taxonomy.
- Does any sibling package or host need a broad Roaster Capability API, or is `@sdl/roaster/api` initially a small set of review/run/log/publish contracts and types?
- Which pieces of the closed `roaster-graphite-stack-workflow` Objective should remain parked provenance versus future Roaster product work outside this Capability migration?

## Closure

Closed 2026-06-28 after completing the Roaster Capability migration. Roaster is now modeled as an above-SDK Capability with a gateway-injected Domain Core, thin SDL Command Face, curated `@sdl/roaster/api` surface, and documented storage/publication boundaries.

Delivered scope:

- `sdl roaster ...` is the durable user-facing command face for review list/ls/log/run, roast list, and hidden record/publish automation leaves.
- `@sdl/roaster/api` is the curated in-process Capability API; the broad package root was intentionally left in place as a non-CLI export surface for a possible later narrowing slice.
- Public skills and `.github/workflows/roaster.yml` invoke the SDL command face.
- Review definitions remain under `.sdl/reviews/<key>.md`; review logs remain Branch Memory records in namespace `roaster` under `reviews/<review-key>/...`; findings publication remains an explicit guarded GitHub boundary.
- The standalone `roaster` package binary, source entrypoint, repo-local install shim, and binary-only tests were removed rather than retained as a duplicate public surface.

Key PR evidence:

- PR #2339 (`https://app.graphite.com/github/pr/nseng-ai/sdl-tools/2339`): removed the standalone Roaster CLI, bin wiring, shim target, obsolete CLI tests, and recorded the binary cutover evidence.

Validation recorded during the closing slices included targeted Roaster/SDL package checks and Roaster extension scenarios, plus `just ts-format-check`, `just ts-lint` (with unrelated warnings only), `just ts-check`, `just ts-test`, and `just dprint-check` after formatting. No live GitHub publication validation was performed.

Remaining follow-ups are intentionally outside this closed child Objective: reassess whether to narrow the broad `@sdl/roaster` package root in favor of `@sdl/roaster/api`; address non-binary CLI conformance polish such as structured failure `data` or `review log` continuation/bound state; and consider any future Roaster Graphite-stack/product workflow under a separate Objective.
