# PR Address Capability Extension

## Thesis

PR Address should become a first-party SDL Capability whose portable PR-feedback behavior is owned by `@sdl/pr-address`, exposed to in-process consumers through the curated `@sdl/pr-address/api` Capability API, and made available through an intentional command face rather than remaining only a standalone `pr-address` binary plus Pi shell-outs.

This Objective is a child of `sdl-extension-architecture` Phase 2. The parent architecture has already ratified the Capability model: domain logic belongs in the owning Capability, consumers import `@sdl/<cap>/api` rather than package roots or internals, command faces are thin shells over gateway-injected domain cores, and Pi remains presentation/session glue rather than the domain owner. PR Address is the next useful child because `@sdl/pr-address/api` already exists for PR-feedback gateway DTOs, while Pi still invokes `pr-address` as an external CLI for feedback download/watch workflows and `ts/packages/hosts/pi/CONTEXT.md` explicitly identifies future reusable PR feedback/watch seams as PR Address Capability/API follow-up work.

## Scope

- Inventory PR Address surfaces and consumers across `ts/packages/pr-address/**`, `ts/packages/hosts/pi/src/pr/**`, `ts/packages/local-pi-tools/pr-previews/**`, skills/prompts that instruct agents to use `pr-address`, installation/shim references, and package metadata.
- Define the durable PR Address Capability boundary: Command Face, gateway-injected Domain Core, Capability API, and the remaining Pi presentation/session responsibilities.
- Rebaseline the existing `@sdl/pr-address/api` surface. Keep or refine its PR-feedback gateway seam, status/check DTO re-exports, and review-thread mutation types so in-process consumers import from the Capability API rather than `@sdl/core/github-pr-feedback` or raw Pi helpers.
- Move reusable PR-feedback domain behavior into PR Address-owned, gateway-injected core modules where it is currently trapped behind CLI operation code or Pi shell-out adapters. Candidate areas include feedback snapshot/summary construction, branch-to-PR mapping, PR feedback collection, check/status normalization, review-thread reply/resolve operations, and any reusable watch/fingerprint primitives proven by the Pi workflow.
- Decide and implement the command-face disposition for PR Address. If portable operations move into an SDL-owned grouped command face, the intended group name is `sdl address ...` rather than `sdl pr-address ...`; otherwise record why the standalone `pr-address` CLI remains transitional for this child slice.
- Align Pi PR feedback adapters in place. Pi should keep editor prefill, stack-prompt assembly, live watch UI/state, idle/dirty gating, notifications, and prompt injection, while deterministic PR feedback collection, normalization, and review-thread mutation behavior belongs to PR Address core/API or command leaves.
- Update PR Address, Pi, SDL, context, docs, and parent Objective tracking so future agents can see the PR Address Capability API, command face, domain-core boundary, and any parked watch/presentation residue.

## Non-Goals

- Do not make Pi the PR-feedback domain owner. Pi may keep presentation, editor, prompt-injection, and session/watch orchestration behavior, but portable PR feedback collection and mutation semantics belong to PR Address.
- Do not change GitHub review-thread reply/resolve semantics, PR lookup behavior, check/status rollup meaning, or output schemas without explicit compatibility rationale and tests.
- Do not mutate real GitHub PRs, resolve review threads, reply to review threads, or download private PR feedback as validation unless a later user explicitly includes that external write/read action in confirmed scope.
- Do not migrate Roaster or Aretro in this Objective. Roaster findings/check previews and Aretro retrospective evidence remain separate remaining child capability candidates under the parent architecture Objective.
- Do not introduce a generic GitHub capability package. ADR 0016 keeps neutral identity/status mechanics in `@sdl/core` and the PR-feedback seam owned by `@sdl/pr-address/api`.
- Do not add hidden registries, YAML/frontmatter, UUID lifecycle state, task databases, or workflow-controller behavior to PR Address.
- Do not preserve duplicate durable public command implementations after an intentional command-face cutover is complete; classify retained standalone CLI behavior as transitional or explicitly intentional.

## Completion Criteria

- The current PR Address surface and consumer inventory is recorded, including standalone CLI operations, Pi PR download/watch/editor-prefill flows, local PR preview dependencies, skills/prompts, install/shim references, and any direct imports of lower GitHub PR-feedback primitives.
- `@sdl/pr-address/api` is the curated Capability API for in-process PR-feedback consumers. Consumers that need typed PR-feedback behavior import this API rather than package roots, private source paths, `@sdl/core/github-pr-feedback`, or Pi implementation modules.
- PR Address domain behavior for feedback collection, feedback snapshot/summary construction, branch-to-PR mapping, check/status normalization, and review-thread reply/resolve operations is gateway-injected and covered with fake-backed tests at the PR Address package boundary.
- The command-face disposition is settled and implemented or explicitly deferred with rationale. If SDL command leaves are introduced, they preserve portable `pr-address` operation behavior with targeted SDL command tests; if the standalone CLI remains, its transitional status and future cutover criteria are documented.
- Pi PR feedback adapters keep their user-facing command names and UX while delegating deterministic PR-feedback domain behavior to PR Address core/API or command leaves. Pi retains only presentation/session responsibilities such as editor prefill, prompt injection, live watch UI/state, dirty-tree/idle gating, and notifications.
- PR Address, Pi, SDL, and root context/docs explain the Capability API, Command Face, Domain Core, Pi presentation boundary, and parked follow-ups. The parent `sdl-extension-architecture` Objective can record PR Address as a completed child migration or a clearly bounded partial migration with follow-up work.

## Assumptions and Risks

Assumptions:

- `@sdl/pr-address/api` already exists because PR-feedback has a real in-process consumer seam; this Objective should refine and expand that seam only from concrete Pi/preview/command consumers.
- Pi's current shell-outs to `pr-address` are a useful migration baseline, not a desired final architecture for reusable PR-feedback domain behavior.
- The PR Address command face may need an SDL `sdl address ...` shape eventually, but the implementation decision should still be based on inventory and existing grouped-command mechanics rather than preserving the standalone CLI by habit.
- ADR 0016 remains binding: PR Address owns PR-feedback seams, while neutral GitHub identity/status mechanics stay in `@sdl/core` and no generic GitHub Capability is introduced.

Risks:

- PR feedback workflows touch external GitHub state. Mitigate by keeping real GitHub reads/writes out of validation unless explicitly confirmed, and by using fake gateways for domain and command tests.
- Pi watch/editor behavior may mix reusable PR-feedback semantics with session presentation. Mitigate by slicing migration around pure collection/normalization/mutation seams first and leaving prompt/UI orchestration in Pi.
- Expanding `@sdl/pr-address/api` could accidentally re-export too much lower GitHub plumbing. Mitigate by making the API consumer-driven and by documenting why each exported type or operation belongs to the Capability boundary.
- Cutting over command surfaces could disrupt existing agent instructions that name `pr-address exec ...`. Mitigate with source inventory, docs/skill updates, and an explicit transitional-vs-cutover decision before removing or replacing any durable CLI surface.
- Roaster markers/check previews and PR Address feedback summaries overlap in PR review vocabulary. Mitigate by keeping Roaster findings ownership separate and treating PR Address as the collector/normalizer for GitHub PR feedback, not the Roaster review runner.

## Open Questions

- Should PR Address gain the grouped SDL command face `sdl address ...`, or should the standalone `pr-address` CLI remain a transitional command face until another migration slice proves the SDL shape?
- If a future non-Pi or command-face consumer appears for PR feedback watch/fingerprint behavior, what focused `@sdl/address/api` seam should replace the current Pi-resident watch-specific implementation?
- Should local PR preview behavior consume more PR Address API surface, or is it correctly bounded as a Pi-tool presentation package over already-collected feedback/check data?
