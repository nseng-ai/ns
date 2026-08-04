# Test-Boundary Refactorings

A catalog of named refactoring techniques for moving test cost across this repository's test
boundaries while preserving behavior confidence. The techniques are distilled from applied,
evidenced slices recorded in `.ns/objectives/standing-test-performance-boundaries/updates/`; each
entry names a transformation that has already been used there. Entry names are imperative verb
phrases naming the transformation, in the style of Fowler's *Refactoring*.

Entries cite their governing documents rather than restating them. Where an entry touches gateway
shape, `docs/conventions/consumer-gateways-and-command-shape.md` is authoritative; where it touches
lanes and coverage doctrine, `ts/TESTING.md` is authoritative; vocabulary is defined in root
`CONTEXT.md` § Architecture Boundaries and the `typescript-fake-driven-testing` skill.

## Seam introduction

Seam-introduction transformations create or route a test-substitutable boundary. They form a
decision ladder — take the lowest rung that fits, and climb only on evidence:

1. **Inject Dependency** while the boundary is a single narrow collaborator with local scope.
2. **Inject Gateway** when a suitable gateway contract already exists — receive it, do not rebuild
   it.
3. **Introduce Gateway** only when no existing contract fits and the boundary has earned the
   weight: multiple domain operations, a durable fake needed across many tests, or a second
   consumer.

Each rung produces an artifact already named in root `CONTEXT.md`: a plain **DI Seam**, a
**Consumer Gateway**, and a **Gateway**, respectively.

### Inject Dependency

*Replace a hard-bound collaborator with a single injected parameter that defaults to the real
implementation.*

- **Mechanics:** add one narrow parameter — a function, a single-method collaborator, or a small
  value — with a default-to-real binding. Tests pass a fake or manual substitute; production call
  sites change nothing. No interface type is minted, no fake/adapter pairing is created, no
  composition-root wiring changes.
- **Constraints:** singular by design. Inject *a* dependency, never a
  `Dependencies`/`Deps`/`Services` bag, and never through a DI container or framework override
  (banned by the `typescript-fake-driven-testing` skill and root `CONTEXT.md` *Avoid* lists). The
  name deliberately reclaims dependency injection in its disciplined singular form; "just use DI"
  as design guidance is the smell, not injection itself.
- **Precedent:** `registerSdlExtension(pi, { runCli })` in
  `.ns/objectives/standing-test-performance-boundaries/updates/2026-06-24T122002Z-repeated-integration-setup-for-localized-logic.md`;
  `createFreshNsCliRunner(loader)` in
  `ts/packages/incubating/hosts/pi/extensions/pi-ns-flow/src/fresh-ns-cli.ts`, where a single
  module-loader parameter defaults to the real dynamic import and tests inject a fake loader.

### Inject Gateway

*Receive an existing provider gateway through context instead of constructing it inline or reaching
for ambient state.*

- **Mechanics:** the operation's context carries the gateway; entrypoints bind it to the correct
  exec channel, cwd, telemetry, and environment. Type against a **named Consumer Gateway** — one
  narrowed identity per consumer scope, reused across that scope's helpers.
- **Constraints:** governed by `docs/conventions/consumer-gateways-and-command-shape.md`: the
  inversion rule (no `Real*Gateway` construction mid-flow), gateway clumps become named `*Context`
  types rather than `*Options` fields. An
  ad-hoc anonymous `Pick<…Gateway, …>` in a signature does not earn its keep: name the identity,
  take the full provider contract (fakes are canonical, so tests lose nothing), or drop to
  **Inject Dependency** for a single operation.
- **Precedent:** `HandoffGitGateway`, `LandGitGateway`, and `GraphiteStackGitGateway` — the named
  Consumer Gateways cited with the inversion rule's live examples in
  `docs/conventions/consumer-gateways-and-command-shape.md`.

### Introduce Gateway

*Mint a new semantic, capability-shaped gateway with a paired real adapter and true in-memory
fake.*

- **Mechanics:** define a domain-first contract — domain operations over domain objects, never
  substrate primitives — with the real adapter at the edge and a constructor-state in-memory fake
  as a true alternate implementation. Wire at a composition root or `createReal*Context` factory.
  Placement follows ADR 0019 (refined by ADR 0032); shape follows
  `docs/conventions/consumer-gateways-and-command-shape.md`; fake style follows the
  `typescript-fake-driven-testing` skill.
- **Constraints:** the heavyweight rung — take it only when the boundary has multiple domain
  operations, needs a durable fake across many tests, or has a second consumer. One canonical fake
  per gateway; consumers do not mint per-test fakes. Introducing means *new*: when a suitable
  contract already exists, the transformation is **Inject Gateway**.
- **Precedent:** `PlanStoreGateway` with `InMemoryPlanStoreGateway` and a real-adapter integration
  smoke, in
  `.ns/objectives/standing-test-performance-boundaries/updates/2026-06-28T201757Z-plans-plan-store-gateway.md`
  — also the model for domain-specific storage gateways over raw filesystem operations.
