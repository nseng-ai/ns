# Test-Boundary Refactorings

A catalog of named refactoring techniques for moving test cost across this repository's test
boundaries while preserving behavior confidence. The techniques come from applied, evidenced slices
recorded in `.ns/objectives/standing-test-performance-boundaries/updates/`. Each entry names a
transformation that has already been used there. Entry names are imperative verb phrases naming the
transformation, in the style of Fowler's *Refactoring*.

Entries cite their governing documents instead of restating them. For gateway shape,
`docs/conventions/consumer-gateways-and-command-shape.md` is authoritative. For lanes and coverage
doctrine, `ts/TESTING.md` is authoritative. Vocabulary is defined in root `CONTEXT.md`
§ Architecture Boundaries and the `typescript-fake-driven-testing` skill.

## Seam introduction

Seam-introduction transformations create or route a test-substitutable boundary. They form a
decision ladder: take the lowest rung that fits, and climb only on evidence.

1. **Inject Dependency** while the boundary is a single narrow collaborator with local scope.
2. **Inject Gateway** when a suitable gateway contract already exists: receive it, do not rebuild
   it.
3. **Introduce Gateway** only when no existing contract fits and the boundary has earned the
   weight: multiple domain operations, a durable fake needed across many tests, or a second
   consumer.

Each rung produces an artifact already named in root `CONTEXT.md`: a plain **DI Seam**, a
**Consumer Gateway**, and a **Gateway**, respectively.

### Inject Dependency

*Replace a hard-bound collaborator with a single injected parameter that defaults to the real
implementation.*

- **Mechanics:** add one narrow parameter with a default-to-real binding. The parameter is a
  function, a single-method collaborator, or a small value. Tests pass a fake or manual substitute.
  Production call sites change nothing. No interface type is minted, no fake/adapter pairing is
  created, no composition-root wiring changes.
- **Constraints:** singular by design. Inject *a* dependency, never a
  `Dependencies`/`Deps`/`Services` bag, and never through a DI container or framework override
  (banned by the `typescript-fake-driven-testing` skill and root `CONTEXT.md` *Avoid* lists). The
  name deliberately reclaims dependency injection in its disciplined singular form. The smell is
  "just use DI" as design guidance, not injection itself.
- **Precedent:** `registerSdlExtension(pi, { runCli })` in
  `.ns/objectives/standing-test-performance-boundaries/updates/2026-06-24T122002Z-repeated-integration-setup-for-localized-logic.md`;
  `createFreshNsCliRunner(loader)` in
  `ts/packages/incubating/hosts/pi/extensions/pi-ns-flow/src/fresh-ns-cli.ts`, where a single
  module-loader parameter defaults to the real dynamic import and tests inject a fake loader.

### Inject Gateway

*Receive an existing provider gateway through context instead of constructing it inline or reaching
for ambient state.*

- **Mechanics:** the operation's context carries the gateway. Entrypoints bind it to the correct
  exec channel, cwd, telemetry, and environment. Type against a **named Consumer Gateway**: one
  narrowed identity per consumer scope, reused across that scope's helpers.
- **Constraints:** governed by `docs/conventions/consumer-gateways-and-command-shape.md`: the
  inversion rule (no `Real*Gateway` construction mid-flow), and gateway clumps become named
  `*Context` types instead of `*Options` fields. An
  ad-hoc anonymous `Pick<…Gateway, …>` in a signature does not earn its keep: name the identity,
  take the full provider contract (fakes are canonical, so tests lose nothing), or drop to
  **Inject Dependency** for a single operation.
- **Precedent:** `HandoffGitGateway`, `LandGitGateway`, and `GraphiteStackGitGateway`, the named
  Consumer Gateways cited with the inversion rule's live examples in
  `docs/conventions/consumer-gateways-and-command-shape.md`.

### Introduce Gateway

*Mint a new semantic, capability-shaped gateway with a paired real adapter and true in-memory
fake.*

- **Mechanics:** define a domain-first contract: domain operations over domain objects, never
  substrate primitives. The real adapter sits at the edge, and a constructor-state in-memory fake
  is a true alternate implementation. Wire at a composition root or `createReal*Context` factory.
  Placement follows ADR 0019 (refined by ADR 0032). Shape follows
  `docs/conventions/consumer-gateways-and-command-shape.md`. Fake style follows the
  `typescript-fake-driven-testing` skill.
- **Constraints:** this is the heavyweight rung. Take it only when the boundary has multiple domain
  operations, needs a durable fake across many tests, or has a second consumer. One canonical fake
  per gateway; consumers do not mint per-test fakes. Introducing means *new*: when a suitable
  contract already exists, the transformation is **Inject Gateway**.
- **Precedent:** `PlanStoreGateway` with `InMemoryPlanStoreGateway` and a real-adapter integration
  smoke, in
  `.ns/objectives/standing-test-performance-boundaries/updates/2026-06-28T201757Z-plans-plan-store-gateway.md`.
  The same update is also the model for domain-specific storage gateways over raw filesystem
  operations.

## Dependency-injection vocabulary

This repository does not treat "dependency injection" as a design term. The phrase names the
*mechanism* shared by every rung above. The endorsed design vocabulary is the artifact each rung
produces: **DI Seam**, **Consumer Gateway**, **Gateway** (root `CONTEXT.md` § Architecture
Boundaries). Recommending "use dependency injection" without naming a rung is a smell. It invites
the banned trappings (containers, decorators, `Dependencies`/`Deps`/`Services` bags, `…Loader`
noun-types) while the actual decision is which rung the boundary has earned.

## Test relocation

Test-relocation transformations move existing coverage to the lane that owns its cost, without
changing what the tests assert.

### Move Real-Boundary Test to Integration

*Relocate a test that exercises a real external boundary from the default lane into the package's
`test/integration/` directory.*

- **Mechanics:** find default-lane tests whose subject crosses a real external boundary. What
  counts as one — real Git, spawned child processes, real CLI entrypoints, cold runtime or dynamic
  import, sqlite, network — is governed by `ts/TESTING.md` § Integration boundary guidance. Apply
  one of two variants: move the whole file when every case crosses the boundary, or split a mixed
  file, moving the boundary cases to a new integration file while the pure cases keep the default
  file. Prove placement with lane discovery: default-config discovery no longer lists the moved
  tests and integration-config discovery does (`ts/TESTING.md` § Lane locators).
- **Constraints:** coverage moves; it is never deleted. The transformation changes cost placement,
  not total cost. Before moving, inventory every confidence claim the test makes and name the
  retained owner of each claim (`ts/TESTING.md` § Cross-product coverage model). Do not leave a
  token assertion behind in the default lane, such as a check that the moved subject is still
  exported. That residue was rejected as a variant of this entry; its one recorded instance is the
  `createTempGitRepo` export check in the sdl-core update cited below. An inert temp-directory
  fixture is not a real boundary; tests that only read and write scratch files stay default.
- **Precedent:** whole-file moves in
  `.ns/objectives/standing-test-performance-boundaries/updates/2026-06-28T195309Z-slot-alias-cli-integration-lane.md`
  and
  `.ns/objectives/standing-test-performance-boundaries/updates/2026-06-20T181625Z-vibechk-rebaseline-next-boundary.md`;
  mixed-file splits in
  `.ns/objectives/standing-test-performance-boundaries/updates/2026-06-20T184212Z-asdl-core-run-command-integration.md`,
  `.ns/objectives/standing-test-performance-boundaries/updates/2026-06-28T194006Z-slow-default-test-boundary-cleanup.md`,
  and
  `.ns/objectives/standing-test-performance-boundaries/updates/2026-07-01T132808Z-sdk-module-loader-import-smoke-integration.md`.
  The rejected export-shape residue is recorded in
  `.ns/objectives/standing-test-performance-boundaries/updates/2026-06-23T230148Z-sdl-core-temp-git-repo-integration-split.md`.
