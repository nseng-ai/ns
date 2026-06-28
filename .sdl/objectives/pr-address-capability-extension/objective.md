# Address Capability Extension

## Thesis

The former PR Address surface has landed as the **Address Capability**: portable PR-feedback behavior is owned by `@sdl/address`, in-process consumers use the curated `@sdl/address/api` Capability API, and the repository command face is `sdl address exec ...` rather than a standalone legacy binary or Pi-owned shell-out domain.

This Objective is a child of `sdl-extension-architecture` Phase 2. The parent architecture has already ratified the Capability model: domain logic belongs in the owning Capability, consumers import `@sdl/<cap>/api` rather than package roots or internals, command faces are thin shells over gateway-injected domain cores, and Pi remains presentation/session glue rather than the domain owner. Address is the PR-feedback capability slice: ADR 0016 keeps neutral GitHub identity/status mechanics in `@sdl/core`, while PR-feedback seams and mutation vocabulary are owned by `@sdl/address/api`.

## Scope

- Inventory the original PR Address surfaces and consumers across the package, Pi PR workflows, local PR preview tools, skills/prompts, install/shim references, package metadata, and source references to the old standalone CLI and lower GitHub PR-feedback primitives.
- Define the durable Address Capability boundary: `sdl address exec ...` Command Face, gateway-injected Domain Core, curated `@sdl/address/api` Capability API, and the remaining Pi presentation/session responsibilities.
- Rebaseline the Address API surface. Keep or refine its PR-feedback gateway seam, status/check DTO re-exports, and review-thread mutation types so in-process consumers import from `@sdl/address/api` rather than `@sdl/core/github-pr-feedback`, package internals, or raw Pi helpers.
- Move reusable PR-feedback domain behavior into Address-owned, gateway-injected core modules where it was previously trapped behind command glue or Pi shell-out adapters. Covered areas include feedback snapshot/summary construction, branch-to-PR mapping, PR feedback collection, check/status normalization, and review-thread reply/resolve operations.
- Cut over the command-face disposition: portable operations live under the SDL grouped command face `sdl address exec ...`; the standalone legacy binary/install shim is removed rather than preserved as a durable public surface.
- Align Pi PR feedback adapters in place. Pi keeps editor prefill, stack-prompt assembly, live watch UI/state, idle/dirty gating, notifications, and prompt injection, while deterministic PR feedback collection, normalization, and review-thread mutation behavior belongs to Address core/API or command leaves.
- Update Address, Pi, SDL, root context/docs, and parent Objective tracking so future agents can see the Address Capability API, command face, domain-core boundary, and any parked watch/presentation residue.

## Non-Goals

- Do not make Pi the PR-feedback domain owner. Pi may keep presentation, editor, prompt-injection, and session/watch orchestration behavior, but portable PR feedback collection and mutation semantics belong to Address.
- Do not change GitHub review-thread reply/resolve semantics, PR lookup behavior, check/status rollup meaning, or output schemas without explicit compatibility rationale and tests.
- Do not mutate real GitHub PRs, resolve review threads, reply to review threads, or download private PR feedback as validation unless a later user explicitly includes that external write/read action in confirmed scope.
- Do not migrate Roaster or Aretro in this Objective. Roaster findings/check previews and Aretro retrospective evidence remain separate remaining child capability candidates under the parent architecture Objective.
- Do not introduce a generic GitHub capability package. ADR 0016 keeps neutral identity/status mechanics in `@sdl/core` and the PR-feedback seam owned by `@sdl/address/api`.
- Do not add hidden registries, YAML/frontmatter, UUID lifecycle state, task databases, or workflow-controller behavior to Address.
- Do not preserve duplicate durable public command implementations after the `sdl address exec ...` cutover.

## Completion Criteria

- The original PR Address surface and consumer inventory is recorded, including standalone CLI operations, Pi PR download/watch/editor-prefill flows, local PR preview dependencies, skills/prompts, install/shim references, and any direct imports of lower GitHub PR-feedback primitives.
- `@sdl/address/api` is the curated Capability API for in-process PR-feedback consumers. Consumers that need typed PR-feedback behavior import this API rather than package roots, private source paths, `@sdl/core/github-pr-feedback`, or Pi implementation modules.
- Address domain behavior for feedback collection, feedback snapshot/summary construction, branch-to-PR mapping, check/status normalization, and review-thread reply/resolve operations is gateway-injected and covered with fake-backed tests at the Address package boundary.
- The command-face disposition is settled and implemented: portable operations are mounted as `sdl address exec ...`, active Pi/local consumers are cut over, and the standalone legacy binary/install shim is removed.
- Pi PR feedback adapters keep their user-facing command names and UX while delegating deterministic PR-feedback domain behavior to Address core/API or command leaves. Pi retains only presentation/session responsibilities such as editor prefill, prompt injection, live watch UI/state, dirty-tree/idle gating, and notifications.
- Address, Pi, SDL, and root context/docs explain the Capability API, Command Face, Domain Core, Pi presentation boundary, and parked follow-ups. The parent `sdl-extension-architecture` Objective records Address as a completed child migration with a bounded watch/fingerprint follow-up.

## Assumptions and Risks

Assumptions:

- `@sdl/address/api` is the canonical in-process PR-feedback seam; the old package/API identity has no compatibility alias.
- Pi's former shell-outs to the standalone CLI were a migration baseline, not a desired final architecture for reusable PR-feedback domain behavior.
- The accepted command face is `sdl address exec ...`; the standalone legacy command is removed rather than kept as a long-lived alias.
- ADR 0016 remains binding: Address owns PR-feedback seams, while neutral GitHub identity/status mechanics stay in `@sdl/core` and no generic GitHub Capability is introduced.

Risks:

- PR feedback workflows touch external GitHub state. Mitigate by keeping real GitHub reads/writes out of validation unless explicitly confirmed, and by using fake gateways for domain and command tests.
- Pi watch/editor behavior may mix reusable PR-feedback semantics with session presentation. The current closeout accepts Pi-resident watch/fingerprint behavior as presentation/session residue until a concrete non-Pi or Address API consumer appears.
- Expanding `@sdl/address/api` could accidentally re-export too much lower GitHub plumbing. Mitigate by making the API consumer-driven and by documenting why each exported type or operation belongs to the Capability boundary.
- Command-face cutover can disrupt stale agent instructions that still name the legacy command. Mitigate with stale-term searches, skill/doc updates, and the explicit cutover record.
- Roaster markers/check previews and Address feedback summaries overlap in PR review vocabulary. Mitigate by keeping Roaster findings ownership separate and treating Address as the collector/normalizer for GitHub PR feedback, not the Roaster review runner.

## Open Questions

- If a future non-Pi or command-face consumer appears for PR feedback watch/fingerprint behavior, what focused `@sdl/address/api` seam should replace the current Pi-resident watch-specific implementation?
- Should local PR preview behavior consume more Address API surface, or is it correctly bounded as a Pi-tool presentation package over already-collected feedback/check data?

## Closure

Closed as completed. The former PR Address surface has landed as the Address Capability: `@sdl/address/api` is the curated in-process PR-feedback Capability API, `sdl address exec ...` is the portable command face, the standalone legacy binary/install shim is removed, and active Pi/local consumers delegate deterministic PR-feedback behavior to Address-owned seams.

Completion evidence is recorded across the Objective updates and final refresh: the original surface inventory, API rebaseline, package rename, command-group naming decision, `sdl address exec ...` cutover, command-adapter consolidation, gateway-injected Domain Core seams for branch-to-PR mapping, feedback download/Markdown assembly, PR checks, and review-thread reply/resolve mutations, plus the final context/parent tracking refresh. The final roadmap row records the stale-term search exceptions and `just dprint-check` validation.

The closure preserves the accepted safety and ownership boundaries: Address owns portable PR feedback collection, normalization, check payloads, and thread mutations; neutral GitHub identity/status mechanics stay in `@sdl/core`; Pi keeps only presentation/session residue such as editor prefill, prompt injection, stack prompt assembly, live watch state, dirty-tree/idle gating, and notifications; and real GitHub reads/writes remain outside validation unless explicitly confirmed.

Parked items remain outside this completed child Objective: Roaster and Aretro capability migrations, any generic GitHub Capability package, dynamic arbitrary Pi mirroring, broad PR review vocabulary redesign, and watch/fingerprint extraction from Pi until a concrete non-Pi or Address API consumer appears. Parent Objective `sdl-extension-architecture` now records Address as a completed child migration.
