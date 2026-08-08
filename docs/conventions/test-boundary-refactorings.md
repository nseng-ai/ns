# Test-Boundary Refactorings

This catalog contains named refactoring techniques specifically related to testability.

Each entry name is an imperative verb phrase that names the transformation, in the style of Fowler's *Refactoring*.

The entries cite their source documents. They do not repeat those documents.

- For the shape of a gateway, `docs/conventions/consumer-gateways-and-command-shape.md` is authoritative.
- For the doctrine about lanes and coverage, `ts/TESTING.md` is authoritative.
- Root `CONTEXT.md` § Architecture Boundaries and the `typescript-fake-driven-testing` skill define the vocabulary.

## Testing Anti-Patterns

Excessive mocking. Left to their own devices, agents instructed to build unit tests will do so with excessive mocking. They end up creating tests that are tautological. These tests prove only that the implementation has its current structure.

Excessive DI. The other extreme is full-stack dependency injection, which is very common in the Java ecosystem. This pattern causes an explosion of classes and types in a codebase—evocatively described as the "Kingdom of Nouns" (https://steve-yegge.blogspot.com/2006/03/execution-in-kingdom-of-nouns.html)—and requires word soup where a function would suffice.

The "smell" that cuts across both of these anti-patterns is that the cost of refactoring is too high. Excessive mocking and tautological tests effectively implement code twice—once in an awkward form with invasive mocking APIs—so every refactor requires a more complex refactoring of the corresponding tests. Similarly, complete full-stack DI introduces testability seams in such a fine-grained manner that any change in structure, rather than behavior, requires invasive test changes.

Since refactoring, by definition, does not change externalized behavior, the ideal is for a refactoring to change as few tests as possible.

Are we saying that mocking and DI have *no* place in this new world? No. They are essential techniques. Fast, side-effect-free tests are critical to the inner loop of software development. Accomplishing this requires the tasteful introduction of testing seams.

## Seam introduction

Transformations for seam introduction introduce a layer of indirection that tests can leverage. These transformations form a decision ladder. Use the lowest rung that fits. Move to a higher rung only when evidence supports that move:

1. Use **Inject Dependency** while the boundary is one narrow collaborator with local scope.
2. Use **Inject Gateway** when a suitable gateway contract already exists. Receive the gateway; do not rebuild it.
3. Use **Introduce Gateway** only when no existing contract fits and the boundary has earned the weight: multiple domain operations, a durable fake needed across many tests, or a second consumer.

Each rung produces an artifact already named in root `CONTEXT.md`: a plain **DI Seam**, a **Consumer Gateway**, and a **Gateway**, respectively.

### Inject Dependency

*Replace a hard-bound collaborator with a single injected parameter that defaults to the real implementation.*

- **Mechanics:** Add one narrow parameter with a default that binds to the real implementation. The parameter can be a function, a single-method collaborator, or a small value. Tests pass a fake or a manual substitute. Production call sites do not change. Do not create an interface type. Do not create a fake and adapter pair. Do not change the wiring of the composition root.
- **Constraints:** This technique is singular by design. Inject one dependency. Never inject a `Dependencies`/`Deps`/`Services` bag. Never use a DI container or a framework override. The `typescript-fake-driven-testing` skill and the *Avoid* lists in root `CONTEXT.md` ban these mechanisms. The name deliberately gives dependency injection its disciplined singular meaning. The design advice "just use DI" is the smell; injection itself is not the smell.
- **Precedent:** One precedent is `registerSdlExtension(pi, { runCli })` in `.ns/objectives/standing-test-performance-boundaries/updates/2026-06-24T122002Z-repeated-integration-setup-for-localized-logic.md`. Another precedent is `createFreshNsCliRunner(loader)` in `ts/packages/incubating/hosts/pi/extensions/pi-ns-flow/src/fresh-ns-cli.ts`. In the second precedent, one module-loader parameter defaults to the real dynamic import. Tests inject a fake loader.

### Inject Gateway

*Receive an existing provider gateway through context instead of constructing it inline or reaching for ambient state.*

- **Mechanics:** The context of the operation carries the gateway. Entry points create the context and the appropriate gateway implementation. Use a **named Consumer Gateway** as the type.
- **Constraints:** `docs/conventions/consumer-gateways-and-command-shape.md` governs this technique. Follow the inversion rule: do not construct a `Real*Gateway` in the middle of a flow. Convert gateway clumps to named `*Context` types, not `*Options` fields. An ad-hoc anonymous `Pick<…Gateway, …>` in a signature does not justify its cost. Instead, if a scope-specific narrower gateway type is appropriate, name the narrowed type. Fakes are canonical, so tests lose nothing when you use the full contract. For one operation, you can instead use **Inject Dependency**.
- **Precedent:** The precedents are `HandoffGitGateway`, `LandGitGateway`, and `GraphiteStackGitGateway`. These named Consumer Gateways appear with the live examples for the inversion rule in `docs/conventions/consumer-gateways-and-command-shape.md`.

### Introduce Gateway

*Create a new gateway with domain semantics and a capability-based shape. Pair it with a real adapter and a true in-memory fake.*

- **Mechanics:** Define the contract in domain terms. Expose operations on domain objects, not raw substrate primitives. For example, expose `loadPlanStoreEntry` instead of `readOptionalTextFile`, `listDirectory`, `statPath`, or `writeFile`. Do not return raw subprocess output for domain logic to parse. Let the real adapter perform filesystem, subprocess, HTTP, environment, and wire-format operations. Construct the adapter at an application entry point, a composition root, or a named `createReal*Context` factory. Then pass the gateway through the context to domain operations. Give each consumer a named Consumer Gateway when it needs only part of the provider contract. Do not use an anonymous inline `Pick<…Gateway, …>`.
- **Placement and fake:** Put an ns-independent gateway in Neutral Infra only when a credible external consumer could use the contract substantially unchanged. Otherwise, put an ns-specific external-tool gateway in the applicable Extension Kit subpackage. Preserve downward dependency direction and one canonical import path. See ADR 0019 and ADR 0032 for the full placement rules. Make the in-memory fake implement the same contract as the real adapter. Give the fake its initial external-system state through its constructor, and make it perform no I/O. Use semantic state for expected failures and missing data. Do not use scripted calls or setup mutators as the primary fake interface. See `docs/conventions/consumer-gateways-and-command-shape.md` and the `typescript-fake-driven-testing` skill for the full rules.
- **Constraints:** This technique adds a contract, a real adapter, a canonical in-memory fake, composition wiring, and adapter integration coverage. Add these components only when the boundary has multiple domain operations, needs one durable fake across many tests, or has a second consumer. Provide one canonical fake for each gateway. Consumers do not create fakes for individual tests. The word *Introduce* means that you create a new gateway contract. Use **Inject Gateway** when a suitable contract already exists.
- **Precedent:** One precedent is `PlanStoreGateway` with `InMemoryPlanStoreGateway`. It includes a real-adapter integration smoke in `.ns/objectives/standing-test-performance-boundaries/updates/2026-06-28T201757Z-plans-plan-store-gateway.md`. It also models a domain-specific storage gateway that replaces raw filesystem operations.

---

Deviations: none.
