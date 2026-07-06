# Consumer Gateways and Command Shape

Routed from the root `AGENTS.md` ("Architecture rules" section). Read before declaring a new external-tool gateway interface, narrowing a consumer against one, or consolidating overlapping gateways.

A single canonical provider gateway (the 21-method `GitGateway` at `ts/packages/capability-kit/src/git/contract.ts`) is consumed by many capabilities, most of which touch only a handful of methods. This convention keeps that consumption narrow and keeps shared command mechanics in the kit. It is a three-tier rule plus an inversion rule.

## Tier 1 — Consumer Gateways

A capability that consumes an external-tool gateway owns a **Consumer Gateway**: a narrowed interface (a subset of the provider's methods) plus result vocabulary in the capability's own domain terms. The capability owns the vocabulary; the kit owns the provider contract.

- Canonical live examples: `LandGitGateway` (`ts/packages/capabilities/flow/src/land/types.ts`), `GraphiteStackGitGateway` (`ts/packages/capability-kit/src/graphite/stack.ts`), and the `Pick` idiom `HandoffGitGateway = Pick<GitGateway, …>` (`ts/packages/capabilities/handoffs/src/core/artifact-storage.ts`).
- Default: a consumer that uses a handful of `GitGateway` methods should type against a `Pick`-narrowed Consumer Gateway, not the full interface. Widen to the full contract only when the consumer genuinely exercises most of it.

## Tier 2 — Kit-owned pure command-shape

Argv builders, output parsers, and failure classifiers are pure command-shape and live in `@nseng-ai/capability-kit`. A standalone kit *export* is promoted to the shared barrel only when a **second** consumer exists.

- Live example: flow land imports `GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS` from the kit (`ts/packages/capabilities/flow/src/land/stack/land-context-adapter.ts`) rather than re-spelling the `for-each-ref` argv.
- The second-consumer rule governs standalone kit exports, **not** provider-contract methods. A method on the `GitGateway` contract may legitimately have a single caller — 6 of its 21 methods do — because the contract is one cohesive seam, not a grab-bag of independently-promoted helpers.

## Tier 3 — Gateway-object sharing

Sharing an actual gateway *object* across capabilities (not just the contract type) is allowed only when all three hold:

1. the exec channels genuinely coincide;
2. the shared result vocabulary is acceptable to both consumers;
3. the ADR 0019 placement gate passes for the shared implementation.

- Hard callout: flow land's `pi.exec` command-stream/telemetry channel must not be bypassed by handing land a differently-channeled gateway object. Reusing an object across a channel boundary silently drops the telemetry the original channel carried.
- Positive example: `RealSlotRepositoryGateway` (`ts/packages/capabilities/slots/src/core/gateways/repository.ts`) delegates its 8 read-facts to a `RealGitGateway` constructed over the same `NodeCommandExecApi` channel it uses for its own worktree commands — the channels coincide, so object reuse is sound.

## Inversion rule

Production codepaths should receive concrete provider gateways from their entrypoint context rather than constructing `Real*Gateway` adapters in the middle of domain flow logic. Entrypoints are responsible for binding the gateway to the correct exec channel, cwd, telemetry, timeout, and environment semantics, then attaching the narrowed Consumer Gateway to the context passed inward. This keeps gateway wiring visible at I/O boundaries and prevents deep helpers from silently choosing a different command channel.

Duplication is not debt until divergence would be a bug. Two capabilities each owning a 3-line argv builder is healthy; consolidate into a shared kit export only when the two must not diverge. A premature shared export couples two consumers that had no reason to move together.

## Justified single-consumer kit export

A single-consumer kit export needs an explicit justification and a demotion trigger. Example: `resolveWorktreeGitDirs` stays a kit export despite having one external consumer because the kit-internal `detectGitOperationInProgressAt` — itself reached by live flow and slots consumers — calls it (`ts/packages/capability-kit/src/git/worktree-state.ts`). Demoting it into that one external consumer would create a backwards kit→consumer edge. It landed via a deliberate consolidation slice. General form: name why the export stays in the kit, and name the trigger (a second external consumer, or the internal caller going away) that would move it.

## Relationship to ADR 0019

ADR 0019 gates **where** a Real gateway implementation lives (which package owns `RealGitGateway`). This convention gates **the shape** of what consumers type against and what the kit may export as standalone command-shape. They are complementary: consult ADR 0019 for placement of a real adapter, and this doc for consumer-gateway narrowing and kit-export promotion. ADR 0019 cross-references this doc as the home of consumer-facing shape rules.

## Avoid

- "consumer port", "domain port", "partial gateway" — say **Consumer Gateway** (root `CONTEXT.md` bans "port" as a noun for these interfaces).
- widening a consumer to the full `GitGateway` "for convenience" when it uses a handful of methods.
- adding a kit barrel export with one consumer and no explicit justification + demotion trigger.
- bypassing an established exec/telemetry channel to reuse a gateway object.
