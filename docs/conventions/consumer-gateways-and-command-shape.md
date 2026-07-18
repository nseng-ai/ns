# Consumer Gateways and Command Shape

Routed from the root `AGENTS.md` ("Architecture rules" section). Read before declaring a new external-tool gateway interface, narrowing a consumer against one, or consolidating overlapping gateways.

A single canonical provider gateway (the 21-method `GitGateway` at `ts/packages/capability-kit/src/git/contract.ts`) is consumed by many capabilities, most of which touch only a handful of methods. This convention keeps that consumption narrow and keeps shared command mechanics in the kit. It is a three-tier rule plus an inversion rule.

## Domain-first gateway shape

A capability gateway must expose domain operations over domain objects, even when its current real adapter is a thin wrapper over the filesystem, Git, a command, or another external substrate. Do not promote raw substrate primitives such as `readOptionalTextFile`, `listDirectory`, `statPath`, or `writeFile` into a capability-facing gateway just because the first implementation delegates to those calls. The gateway's interface should name what the capability needs: read an installed manifest, discover module artifact declarations, write a provisioned harness artifact, resolve a worktree status, load a plan-store entry, etc.

Thin substrate helpers may still exist inside a real adapter, fake, or kit gateway implementation, but callers should cross the seam in the capability's vocabulary. If a proposed gateway method could be reused unchanged by an unrelated domain because it is just filesystem or process mechanics, it probably belongs below the capability seam, not on the capability gateway.

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

Construct real adapters only at a top-level composition root, in a clearly named `createReal*Context` or equivalent composition factory, or inside a real adapter that is composing its own implementation over the same channel. Tests and focused real-adapter tests may construct the adapter they exercise directly. A domain or workflow operation must not reconstruct a real adapter from a raw command channel or host API object it was handed; receive the required Consumer Gateway through its context instead.

## Composition contexts and gateway clumps

A stable group of runtime collaborators that travels through multiple operations or layers is a **gateway clump**. Replace a demonstrated clump with a capability-owned `*Context` rather than adding the collaborators to an operation's `*Options` or forwarding them as parallel parameters.

Host API objects count as gateway-like runtime collaborators for this rule. This includes the ns extension API object and Pi runtime `ExtensionAPI`, including project-owned narrowed views of either. They vend I/O, interaction, telemetry, registration, or lifecycle capabilities and carry runtime identity even though the domain vocabulary classifies their individual facilities as SDK-provided services rather than Kit Gateways. Repeatedly passing a host API object alongside gateways is therefore evidence of the same composition problem as repeatedly passing several gateways.

Evidence that warrants a named context includes:

- two or more gateways or host API objects repeatedly passed together;
- the same collaborator group forwarded through several helpers;
- gateways or host API objects mixed into operation `*Options` alongside caller-controlled inputs;
- collaborators that must share one command, telemetry, cancellation, or lifetime identity but are reconstructed independently.

A single injected collaborator does not require a context. Neither does a group that appears together at only one composition site. Do not invent a speculative context for possible future dependencies.

Keep these roles distinct:

- `*Context` is a stable, capability-owned set of runtime collaborators. Expose narrowed Consumer Gateways where practical. Use the host API's project-owned narrowed type rather than its broad upstream type when only a subset is needed.
- `*Options` is caller-controlled operation or factory input: arguments, policy choices, flags, and optional configuration. It is not the object domain logic uses as a dependency grab bag.
- Per-invocation data such as raw arguments, command callback context, cwd, environment, and abort signal stays separate from long-lived collaborators unless the type is explicitly an entrypoint command context with that same invocation lifetime.

Name production composition factories `createReal*Context` when the real/fake distinction matters. Tests should construct the same context shape with in-memory gateways rather than introduce a parallel dependency model. Avoid generic `Dependencies`, `Deps`, or `Services` bags; name the context for the capability or workflow whose runtime collaboration it stabilizes.

Duplication is not debt until divergence would be a bug. Two capabilities each owning a 3-line argv builder is healthy; consolidate into a shared kit export only when the two must not diverge. A premature shared export couples two consumers that had no reason to move together.

## Justified single-consumer kit export

A single-consumer kit export needs an explicit justification and a demotion trigger. Example: `resolveWorktreeGitDirs` stays a kit export despite having one external consumer because the kit-internal `detectGitOperationInProgressAt` — itself reached by live flow and slots consumers — calls it (`ts/packages/capability-kit/src/git/worktree-state.ts`). Demoting it into that one external consumer would create a backwards kit→consumer edge. It landed via a deliberate consolidation slice. General form: name why the export stays in the kit, and name the trigger (a second external consumer, or the internal caller going away) that would move it.

## Relationship to ADR 0019

ADR 0019 gates **where** a Real gateway implementation lives (which package owns `RealGitGateway`). This convention gates **the shape** of what consumers type against and what the kit may export as standalone command-shape. They are complementary: consult ADR 0019 for placement of a real adapter, and this doc for consumer-gateway narrowing and kit-export promotion. ADR 0019 cross-references this doc as the home of consumer-facing shape rules. Per ADR 0032, foundation is a possible placement outcome for a gateway whose contract is ns-independent with a credible external-consumer scenario (`@nseng-ai/foundation/exec` is the live example); performing I/O does not by itself rule foundation out, and moving an existing Kit Gateway there still requires the ADR 0019 gate plus this doc's channel analysis.

## Avoid

- "consumer port", "domain port", "partial gateway" — say **Consumer Gateway** (root `CONTEXT.md` bans "port" as a noun for these interfaces).
- `ExecGateway` — retired name. Foundation's exec seam keeps its incumbent generic name `CommandExecApi`; incumbent generic names win absent confusion.
- widening a consumer to the full `GitGateway` "for convenience" when it uses a handful of methods.
- adding a kit barrel export with one consumer and no explicit justification + demotion trigger.
- bypassing an established exec/telemetry channel to reuse a gateway object.
- constructing a real adapter inside domain or workflow logic from a command channel or host API object.
- mixing gateways or host API objects into operation `*Options` as an unnamed dependency bag.
- introducing a broad context for one collaborator or a collaborator group that does not demonstrably travel together.
