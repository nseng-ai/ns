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

*Mint a new semantic, capability-shaped gateway with a paired real adapter and true in-memory fake.*

- **Mechanics:** Define a domain-first contract: domain operations over domain objects, never substrate primitives. Put the real adapter at the edge, and provide a constructor-state in-memory fake as a true alternate implementation. Wire the gateway at a composition root or `createReal*Context` factory. Placement follows ADR 0019 (refined by ADR 0032). Shape follows `docs/conventions/consumer-gateways-and-command-shape.md`. Fake style follows the `typescript-fake-driven-testing` skill.
- **Constraints:** This technique is the heavyweight rung. Use it only when the boundary has multiple domain operations, needs a durable fake across many tests, or has a second consumer. Provide one canonical fake per gateway. Consumers do not create per-test fakes. Introducing means *new*: when a suitable contract already exists, use **Inject Gateway**.
- **Precedent:** One precedent is `PlanStoreGateway` with `InMemoryPlanStoreGateway` and a real-adapter integration smoke in `.ns/objectives/standing-test-performance-boundaries/updates/2026-06-28T201757Z-plans-plan-store-gateway.md`. It is also the model for domain-specific storage gateways over raw filesystem operations.

---

Deviations: none.
