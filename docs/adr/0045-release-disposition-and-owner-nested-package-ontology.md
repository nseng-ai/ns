# ADR 0045: Release disposition and owner-nested package ontology

## Status

Accepted. Decided 2026-07-25 under the `package-disposition-and-host-ontology` Objective
after explicit user approval of this ADR and its complete destination map. This acceptance
settles the architecture and authorizes implementation-stack design; it does not itself
authorize package moves or external publication.

This ADR supersedes ADR 0033's tier-to-directory projection and ADR 0044's path-derived
flat incubation zone. It preserves their architectural tier vocabulary and the other
layering decisions they record unless explicitly changed below.

## Context

The current `ts/packages/` tree asks one directory axis to answer two different questions.
The tier projection introduced by ADR 0033 answers architectural role: Neutral Infra,
SDK, Extension Kit, extension, host, standalone tool, or internal tool. ADR 0044 then added
a flat `incubator/` exception to express release readiness without changing those roles.
As a result, paths are neither a complete architecture map nor a complete release map:
all 11 ns extensions are peers in one flat zone, hosts and tools remain outside it despite
unsettled release status, and the tree cannot show who owns host-specific integration.

The flat exception also makes the desired release boundary awkward to enforce. A package
outside `incubator/` can currently depend on an incubator resident. Preventing that edge
requires a second path policy layered over the tier projection, while moving a package
between incubating and supported states still changes an architectural-looking path.

Pi exposes the ownership problem most clearly. Harness-independent extension logic and Pi
registration currently coexist in five extension packages. The private `@nseng-ai/pi`
host package contains both reusable Pi runtime substrate and repo-specific Pi-native
extensions. The consolidated `@internal/pi-tools` and `@internal/ns-pi-subagents` packages
are Pi-owned but live in a generic internal directory. A reader cannot infer from paths
whether code belongs to ns, to Pi, or only to this repository.

The repository is private and unreleased as a whole, so it can make a clean coordinated
cutover. Individual `@nseng-ai/*` packages have nevertheless been prepared and, in some
cases, released or checkout-free-smoked. The migration therefore needs an explicit,
package-by-package disposition decision rather than treating current publication metadata
or current directory as authority.

The complete proposed classification and split inventory is
[`package-destination-map.md`](../../.ns/objectives/package-disposition-and-host-ontology/references/package-destination-map.md).
That map is part of this decision: acceptance requires approving both documents together.

## Decision

### 1. The first package-path segment is release disposition

Every first-party TypeScript workspace package belongs to exactly one of three mutually
exclusive dispositions:

- **`public`**: the package is warranted for external release and ongoing support. This is
  a release commitment, not a claim that the current version is already present on npm.
- **`incubating`**: the package has genuine external release intent, but its contract or
  evidence is not ready for that commitment.
- **`internal`**: the package exists to operate this repository and has no current external
  release intent. It is not a waiting room for publication.

The disposition roots are `ts/packages/public/`, `ts/packages/incubating/`, and
`ts/packages/internal/`. No workspace package remains directly under `ts/packages/`, in
an old role directory, or as package-grade code under `.ns/` after the cutover.

Disposition is path-derived. It is not another `ns.tier` value and is not duplicated in a
manifest field or allowlist. Moving a package between dispositions is a deliberate release
intent decision and a path move; its architectural tier need not change.

### 2. Architectural ownership is nested beneath disposition

The path after the disposition root expresses architectural ownership:

- `extensions/<leaf>/` contains harness-independent ns extensions.
- `hosts/<host>/.../<leaf>/` contains every package specific to an external assistant
  harness. Each host owns the categories below its root; hosts need not mirror Pi.
- `infra/<leaf>/` and `tools/<leaf>/` express shared architectural owners.
- Singular roots such as SDK and Extension Kit are direct leaves (`public/sdk/` and
  `public/extension-kit/`); they are not redundantly nested as `sdk/sdk/` or
  `extension-kit/extension-kit/`.
- Repository-only ns extension packages use `internal/extensions/<leaf>/`.
- Repository development machinery uses `internal/dev/<leaf>/` or another explicit
  internal owner selected in the destination map.

For Pi, the initial owner-specific categories are `runtime/`, `extensions/`, `tools/`, and
`subagents/`. `runtime/` is reusable Pi integration substrate; `extensions/` contains Pi
runtime extensions; `tools/` contains project-only Pi tools; and `subagents/` contains
project-only Pi subagent infrastructure.

`ns.tier` remains the machine-readable architectural classification and continues to drive
layering, cycle, topology-circle, and subpackage checks. It no longer projects to the first
package-path segment. ADR 0032's one-tier-per-package rule and ADR 0022/0023's manifest-
declared subpackage topology remain in force.

### 3. Leaf directories and package identities have one global invariant

Every package leaf directory exactly equals the unscoped part of its npm package name.
Leaf identities are globally unique across all three disposition trees.

- Public and incubating packages use `@nseng-ai/<leaf>`.
- Internal packages use `@internal/<leaf>`, set `private: true`, and are never published.

Parent directories are repository ontology, not npm-name prefixes. For example,
`incubating/hosts/pi/runtime/pi-runtime/` contains `@nseng-ai/pi-runtime`, not a package
named after the complete path.

Identity changes are hard cutovers. There are no forwarding packages, compatibility
exports, or old-name aliases. Historical ADRs and immutable Objective updates retain their
original text.

### 4. Disposition imposes dependency closure

Runtime workspace dependencies obey this matrix:

| Consumer disposition | Allowed provider dispositions      |
| -------------------- | ---------------------------------- |
| `public`             | `public`                           |
| `incubating`         | `public`, `incubating`             |
| `internal`           | `public`, `incubating`, `internal` |

The rule covers `dependencies`, `optionalDependencies`, and runtime `peerDependencies`.
Development-only and test-only edges may cross inward when they cannot affect a produced
package, but the guard must distinguish those edges mechanically rather than by convention.
Existing tier layering remains an independent, simultaneous constraint.

Disposition, scope/private consistency, leaf identity, duplicate leaf rejection, and
closure are derived from one typed package-topology model. New checks must not repeat loose
disposition or tier string literals.

### 5. ns extensions are harness-independent; Pi integration is separately packaged

An ns extension under `extensions/` contains no Pi imports, Pi registration, Pi extension
entrypoint, or `pi` host-surface subpackage. Its domain and command behavior remain in the
ns extension and are exposed to in-process consumers through a curated extension package
API.

Each retained Pi integration over an ns extension becomes one package under
`<disposition>/hosts/pi/extensions/pi-ns-<domain>/`, named
`@nseng-ai/pi-ns-<domain>`. It may consume only the corresponding extension's curated
package API plus package APIs permitted by disposition closure; it may not deep-import
extension source or private command implementation.

A Pi-native extension that does not adapt an ns extension uses a natural Pi-facing identity,
not the `pi-ns-*` form. Project-only Pi extensions and tools use `@internal/*` under the
internal Pi ontology.

### 6. The current Pi host separates runtime substrate from integrations

The reusable substrate in private `@nseng-ai/pi` becomes the incubating
`@nseng-ai/pi-runtime` package at `incubating/hosts/pi/runtime/pi-runtime/`. Its contract
is limited to reusable runtime types, registration and command helpers, parity support,
session/model helpers, and terminal presentation primitives needed by separately owned Pi
packages. Because each extracted `pi-ns-*` adapter consumes Pi Runtime, those adapters are
also incubating until the runtime and adapters are promoted together or the dependency
model changes.

Current host-resident product or repo behavior does not remain hidden in that runtime:

- worktree-status, model-shortcuts, and harness-session become natural Pi extension
  packages at the dispositions recorded in the destination map;
- PR Feedback presentation becomes `@nseng-ai/pi-ns-pr-feedback` and consumes the curated
  `@nseng-ai/pr-feedback/api` surface;
- the existing extension-owned Pi subpackages become `pi-ns-*` packages;
- project-only Pi tools and subagent infrastructure remain internal under Pi-owned paths.

The destination map records the exact initial split. Discovering that a proposed adapter
requires a private import blocks that extraction until the ns extension exposes a reviewed
curated API; it does not justify a private cross-package import.

### 7. The product host and consumer package are made explicit

The checkout-free `@nseng-ai/ns` product moves from `hosts/ns/` to `public/ns/`. It is the
product distribution rather than an external-harness integration, so the short product
path is intentional.

The private `@nseng-ai/ns-init` implementation package is folded into `@nseng-ai/ns`
instead of creating a private package under the public disposition.

The repo-local `@nseng-ai/skill-exposure` workspace package moves out of `.ns/extensions/`
to `incubating/extensions/skill-exposure/` without an identity change. This follows the
initial organizational rule that every ns extension remains incubating.

### 8. Documentation and enforcement change atomically with the tree

`ts/packages/README.md` becomes the authoritative contract for dispositions, owner nesting,
identity, and dependency closure. A focused Pi-host README documents Pi's categories and
`pi-ns-*` naming. Other nested READMEs are added only when another owner develops rules
that the shared contract cannot state clearly.

The accepted design may land through a reviewable Graphite stack, but the complete package
cutover is one coordinated landing boundary. Trunk must not contain mixed legacy and new
paths, old package aliases, or guards that accept both ontologies. Workspace configuration,
release tooling, source imports, exports, tests, fixtures, package preparation, context
files, and active Objective guidance change with the cutover.

## Consequences

- `ls ts/packages/` communicates release commitment first, while nested paths communicate
  ownership. Architectural tier remains available in manifests and reports rather than
  being overloaded onto the same directory segment.
- Promotion from incubating to public is an explicit path move and review of release
  warrant. Internal-to-incubating/public promotion additionally changes npm scope and is a
  deliberate identity cutover.
- Public dependency closure becomes mechanically visible and enforceable; a public product
  cannot silently rely on an incubating package.
- Separating Pi integrations increases the workspace package count and requires coordinated
  export, peer-dependency, release-order, parity-registry, discovery-adapter, lockfile, and
  documentation changes.
- The `@nseng-ai/pi` rename has a broad ripple through extension adapters and internal Pi
  tools. The hard cut avoids preserving an identity whose package mixed runtime and product
  behavior.
- Every ns extension is incubating for the initial organizational cutover, even when release
  tooling currently lists it as intended-public or checkout-free evidence exists. The
  approved disposition, not historical release metadata, becomes authoritative; release
  catalogs must be regenerated from the final public tree.
- `@nseng-ai/pi-editor-mods` becomes private `@internal/pi-editor-mods`; its previous npm
  installation prose becomes historical rather than release intent.
- ADR 0044 remains an immutable record of the interim flat incubator. Its projection
  exemption and `incubator/` destination are removed rather than generalized.

## Approval evidence

The user explicitly approved the complete destination map and then approved this ADR on
2026-07-25. The next authorized roadmap slice is implementation-stack design. Package
moves, identity cutovers, external publication, and registry writes remain unauthorized
until separately executed under the Objective's later roadmap slices.
