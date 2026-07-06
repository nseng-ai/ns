# ns

This context captures project language for durable planning workflows in this repository.

## Language

**ns**:
The product's proper name. Always lowercase, including at sentence starts; rewrite the sentence rather than capitalizing it. It evokes nonslop, namespace, and Nick Schrock's initials.
*Avoid*: NS, Ns, ns, JI, Ji, SDL, Source Development Lifecycle

**Objective**:
A checked-in documentation workstream for durable multi-session, multi-branch, or multi-PR work.
*Avoid*: hidden agent state, ticket

**Umbrella Objective**:
A prose-only **Objective** pattern that coordinates a family of narrower child Objectives while remaining the durable place for cross-child lessons, migration guides, and synthesized closure evidence. The synthesis duty is part of the pattern, not optional (renamed from Synthesis Objective per `docs/adr/0030-rename-synthesis-objective-to-umbrella-objective.md`).
*Avoid*: Synthesis Objective (retired name), fire-and-forget umbrella, mirrored task tracker, hidden parent state, Objective CLI feature

**Child Objective**:
A narrower **Objective** created from a parent **Umbrella Objective** to own one implementation, research, or migration slice; the child remains `open` until its own **Objective Close**, while the parent roadmap may use `[~]` to show that the child exists and is in progress.
*Avoid*: Subticket, hidden task, third Objective status

**Autoobjective**:
A prose-only **Objective** pattern whose roadmap and runner policy are intentionally shaped for repeated **Objective Runner** steps with parent-LM checkpoints between committed slices.
*Avoid*: Machine category, third Objective status, hidden task queue, unattended batch controller

**Ideation Objective**:
A prose-only **Objective** pattern for the formation phase: the **Destination** is settled first, but the roadmap is deliberately a **Frontier** of open **Question Rows** — not yet executable slices — and questions too coarse to state precisely are held as **Fog** rather than pre-sliced. It reaches **Crystallization** as questions resolve; ideation is a phase every Objective passes through, and this pattern names deliberately staying there while the way is found.
*Avoid*: Forming/Shaping/Discovery/Wayfinding Objective, separate map artifact, ticket tracker, third Objective status

**Destination**:
The settled end-state an **Ideation Objective** is finding its way to — its thesis and completion criteria, fixed before any questions are charted because it shapes what every question asks.
*Avoid*: vision statement, moving target, roadmap row

**Question Row**:
A roadmap row in an **Ideation Objective** that is an open decision or investigation rather than executable work, typed as one of grilling, research, prototype, or task, carrying explicit blocked-by references to other rows, and sized to one agent session.
*Avoid*: ticket, task-tracker item, execution row, subissue

**Frontier**:
The open, unblocked **Question Rows** of an **Ideation Objective** — the questions answerable now. Resolving a frontier row records the decision, may unblock other rows, and graduates any **Fog** the answer made specifiable into new rows.
*Avoid*: backlog, task queue, next-up list

**Fog**:
The deliberately coarse view of decisions an **Ideation Objective** can tell are coming but cannot yet phrase sharply, held as a marked cluster under `## Open Questions` and never pre-sliced into rows. The test against a **Question Row**: can the question be stated precisely now — not answered.
*Avoid*: sharp open question, hidden backlog, placeholder rows

**Crystallization**:
The phase exit of an **Ideation Objective**: the **Frontier** empties of **Question Rows** and the remaining roadmap is ordinary execution work. Crystallization is a recognizable condition, not a status, marker, or ceremony.
*Avoid*: closure, third Objective status, graduation ceremony

**Orienting Objective**:
A prose-only **Objective** pattern defined by carrying `orientation.md`: a standing, agent-facing rule stating the direction every agent — including agents on unrelated work — must respect while the record is open. The orientation joins the always-load set (`ns objective exec load-orientations`) and leaves it automatically at closure. The name is what it does: it orients agents.
*Avoid*: Cross-cutting Objective (retired name), orientation-bearing Objective, ambient Objective, orientation registry

**Durable Narrative Roadmap Record**:
The role of an **Objective** as human-readable context and ordered work guidance, without owning workflow-control semantics.
*Avoid*: Workflow controller, state machine, task database

**Active Objective Root**:
The checked-in repository directory `.ns/objectives/` that contains Objective records considered by normal Objective discovery, listing, reading, update, next-work, and close workflows.
*Avoid*: open objectives directory, hidden local cache, archive root

**Objective Archive Root**:
The checked-in repository directory `.ns/objective-archive/` that parks Objective records outside normal active discovery without changing their slug, prose, updates, or closure marker.
*Avoid*: deletion, closed objective root, hidden cache

**Archived Objective**:
An **Objective** record located under the **Objective Archive Root**. Archive state is a location choice, not a replacement for open/closed state.
*Avoid*: closed objective, deleted objective, stale update

**Objective Slug**:
The directory name under an Objective root that is the stable identity for one **Objective**.
*Avoid*: title, branch name, PR name, package name

**Objective Slug Migration**:
An explicit move of an **Objective** from one slug directory to another after the user chooses a new canonical identity.
*Avoid*: rename cleanup, path normalization, hidden remap

**Semantic Update**:
An update file that records meaningful objective information such as a finding, decision, blocker, completion evidence, changed plan, or follow-up.
*Avoid*: Ceremonial update, status ping, branch changelog

**Tracking Gate**:
A read-only check that blocks next-work recommendations when branch or worktree evidence suggests objective progress has not been recorded, then either routes clear same-objective cases into the explicit **Objective Update** workflow before continuing or asks for confirmation when the evidence or update scope is ambiguous.
*Avoid*: hidden reconciliation, silent objective mutation, background refresh

**Objective Update**:
The explicit mutation workflow that updates objective tracking by editing durable files and, when there is meaningful semantic information, writing a **Semantic Update**.
*Avoid*: Progress log, automatic refresh, hidden reconciliation

**Objective Close**:
The explicit mutation workflow that records an objective as complete or intentionally abandoned while preserving its checked-in history and writing a **Closure Marker**.
*Avoid*: Deletion, archive, archival state machine

**Objective Archive**:
The explicit directory-move workflow that moves an Objective record between the **Active Objective Root** and the **Objective Archive Root** without editing Objective prose or changing closed/open state.
*Avoid*: Objective Close, slug migration, deletion

**Closure Marker**:
A lightweight `closed.md` file whose existence lets tools identify closed objectives without language-model interpretation.
*Avoid*: Hidden status, archive state, deletion

**Record Frontmatter**:
An optional YAML block at the top of an **Objective**'s `objective.md` carrying exactly two keys — `blocked` (the **Blocked Sentence**) and `edges` (**Objective Edges**) — and nothing else (ADR 0025). Most records have none; every `objective.md` reader strips or parses the block and behaves identically for records with and without it.
*Avoid*: general metadata block, execution-policy store, extra frontmatter keys, hidden attachment metadata, registry

**Objective Edge**:
An undirected, kind-less, mirrored connection between two **Objective** records, listed in both endpoints' **Record Frontmatter** as `{objective: <slug>, annotation: <sentence>}`. Edge identity is the unordered slug pair, with at most one edge between two records; direction, causality, and relationship kind live in the **Edge Annotation** prose, never the schema. Mutation is skill-owned, and archiving an endpoint does not break an edge.
*Avoid*: typed edge kind, `to:`/`from:` directionality, single-sided edge, machine-readable dependency link

**Edge Annotation**:
The required prose sentence each endpoint of an **Objective Edge** carries in its own **Record Frontmatter**, written from that record's perspective. The two sides are deliberately different texts — perspective is the payload, so a shared string would lose exactly the information the edge exists to carry.
*Avoid*: shared edge label, edge kind, machine-readable edge semantics, optional comment

**Blocked Sentence**:
The prose-valued `blocked:` key in **Record Frontmatter**: presence means the record is blocked (for any reason — another objective, an external gate) and the value says why. There is no boolean — the sentence is the state — and it is set and cleared only by skill judgment, never by machine auto-flip.
*Avoid*: blocked boolean, machine-derived flag, lifecycle state, status ping

Objective state vocabulary clusters as: open vs. closed is the lifecycle state (the **Closure Marker** decides closed), active vs. archived is a location choice (**Objective Archive Root**), and blocked — the presence of a **Blocked Sentence** — is a sub-state of open, not a third lifecycle state.

## Architecture Boundaries

These terms are general across the codebase. The canonical definitions are replicated here for discoverability; the `typescript-fake-driven-testing` skill carries the fuller mechanics.

**Gateway**:
The canonical interface to an external or non-deterministic capability — process execution, Git, GitHub, filesystem-backed storage, network, the system clock, and timers. Business logic depends on a Gateway rather than on the raw capability, so the Gateway is the single seam where real I/O is replaced by an in-memory fake in tests. External-service boundaries carry the `Gateway` suffix (`ExecGateway`, `GitGateway`, `PRGateway`); small runtime primitives are Gateways by category but named bare (`Clock`, `TimerScheduler`). Filesystem-backed gateways must be domain-specific seams above raw filesystem operations, such as `ObjectiveStorageGateway` or plan-store storage, not a pure/shared `FileSystemGateway`; the domain gateway owns path vocabulary, containment rules, and persistence semantics while its real adapter may use `fs` internally.
*Avoid*: port, generic service locator, dependency-injection bag, pure filesystem gateway, shared `FileSystemGateway`

**Domain logic**:
Deterministic code that consumes one or more **Gateways** to produce or transform domain values, such as assembling a worktree's status from several `ExecGateway` calls. It is not a seam to the outside world: substituting domain logic in a test fakes logic you own, so prefer faking the **Gateway** beneath it. Name domain logic with a domain-specific verb (`load`, `read`, `resolve`, `assemble`, …, chosen for the domain action, not a mandated prefix); do not mint `…Loader` noun-types or a `loaders`/`…Dependencies` collection that dresses stateless functions up as a stateful collaborator.
*Avoid*: business logic, application logic, loader, `…Loader` type, `…Dependencies` injection bag

### Extension Layering

The ns extension stack, bottom to top: **Neutral Infra** below the SDK (`@nseng-ai/foundation` as the pure utility library plus other non-domain infra such as `@nseng-ai/clinkr`), the SDK (`@nseng-ai/kernel` plus its `sdk` subpackage), the **Capability Kit**, and the **Capabilities** (first-party **Extensions**) built on it. Real-world/external-tool gateways are not **Neutral Infra**: their first-party seams, fakes, and real adapters now live as **Capability Kit** subpackages such as `@nseng-ai/capability-kit/git`, `@nseng-ai/capability-kit/github`, `@nseng-ai/capability-kit/graphite`, and `@nseng-ai/capability-kit/cmux`; the former standalone **Capability Gateway Backend** tier is retired. Intrinsic host services expose author-facing interfaces through `@nseng-ai/kernel/sdk` / `ctx`, with implementations hidden in the kernel. Those first-party extensions form an **Extension Dependency Graph** that must stay acyclic. ADR 0012 holds the layering diagram and the rule that capability domain lives in the capabilities and never in the `@nseng-ai/pi` runtime host or kernel; ADR 0009 holds the dependency-graph invariant; ADR 0018 holds the four-bucket neutral-infra classification rule, refined by ADR 0019's package-placement gate (which concrete package owns a large real gateway implementation, and whether it folds into Capability Kit or stays standalone/deferred). The SDK boundary is permeable downward only to concepts that prove general worth. These terms name its parts.
**Neutral Infra**:
The pure floor below the SDK — **Pure Utility** libraries plus other non-domain packages/subpackages with no real-world I/O (`@nseng-ai/foundation`, `@nseng-ai/foundation/cli-theme`, `@nseng-ai/clinkr`) that depend only on other Neutral Infra. It excludes gateways: a gateway's seam, fake, and real adapter are **Kit Gateway** material owned by **Capability Kit** subpackages, not Neutral Infra. A gateway *contract* — pure interface types with no I/O — may live here as a **Pure Utility** only when it has proven broadly neutral.
*Avoid*: neutral-infra gateway (a gateway is a Kit Gateway, never Neutral Infra)

**Pure Utility**:
A deterministic transform with no I/O and no ns runtime knowledge. Pure utilities stay in `@nseng-ai/foundation` and may be imported directly by any layer.
*Avoid*: gateway, host service, runtime harness

**Kit Gateway**:
The per-domain *seam* for a real-world I/O, external-tool, external-protocol, or precise filesystem-backed gateway — its contract, fake/testing support, `ctx`→gateway adapter, and real adapter — owned at `@nseng-ai/capability-kit/<domain>`. It is first-party gateway infrastructure, not product capability domain.
*Avoid*: neutral-infra gateway, product capability, generic filesystem gateway

**Consumer Gateway**:
A capability-owned narrowed gateway interface — a subset of a provider **Gateway**'s methods (often a `Pick`), with result vocabulary in the consuming capability's own domain terms. The capability owns the narrowed interface and its vocabulary; the **Kit Gateway** owns the full provider contract. `docs/conventions/consumer-gateways-and-command-shape.md` holds the narrowing and command-shape rules.
*Avoid*: consumer port, partial gateway, domain port

**Capability Gateway Backend**:
A retired transitional term for the standalone packages that used to own heavy real **Kit Gateway** implementations before the gateway backends folded into **Capability Kit** subpackages. Do not use `capability-gateway-backend` as a live package tier or introduce new packages in that role; use **Kit Gateway** for the current `@nseng-ai/capability-kit/<domain>` ownership model.
*Avoid*: live tier, new backend package, gateway-adapter, neutral-infra gateway

**SDK-provided service**:
An intrinsic host service reached by extension authors through `ctx` / the vended API object. Its author-facing interface lives in `@nseng-ai/kernel/sdk`; its implementation is hidden in the kernel. If the author reaches it through the vended API object, classify it as SDK-provided.
*Avoid*: kit gateway, raw process/global import, capability-owned host primitive

**Runtime Harness**:
Program boot code that creates or wires the vended API object and is never reached through `ctx`. Runtime harness code belongs in the kernel or a named neutral CLI-runtime infra home, not in `@nseng-ai/foundation` long term.
*Avoid*: SDK service, capability API, imported utility

The two leading nouns are orthogonal, not synonyms: an **Extension** is the technical construct; a **Capability** is a feature area implemented as one.

**Extension**:
The technical construct — a package that plugs into the SDK via `defineExtension()`. General and third-party-buildable: a first-party extension implements a **Capability**, but the construct is open to third-party extensions that are not ns capabilities.
*Avoid*: plugin, built-in, bundled command, "extension API" (bare — write `@nseng-ai/kernel/sdk` "ns extension API" or "Pi runtime extension API")
**Capability**:
A first-party ns feature area (objectives, handoff, slot, flow, …) — a set of domain capabilities packaged as an **Extension** built on the **Capability Kit**. It exposes kernel-loaded CLI/Pi commands, and adds a **Capability API** only when a **consumer** extension depends on it in-process.
*Avoid*: plugin, built-in, the bare construct "extension" (the extension is the mechanism; the capability is the feature area)

**First-party extension**:
An ns-shipped, ns-owned **Extension** that implements a **Capability** (flow, objective, handoff, slot, branch-context, plans, address, roaster, aretro, and **CCC**), as opposed to a third-party extension.
*Avoid*: built-in extension, bundled extension (reserve for packaging), core extension

**Capability Kit**:
The shared substrate (`@nseng-ai/capability-kit`) that first-party **Capabilities** are built on — the `ctx`→**Gateway** adapter, shared result/error shapes, first-party per-domain gateway seams/adapters/fakes (`exec`, `git`, `github`, shell, temp-file, and similar precise domains), and small first-party capability-building primitives such as checkpoint/worktree/text helpers when SDK/kernel are the wrong home and transitional debt is the only alternative. It is agnostic about *which* product capability owns domain behavior, not public `@nseng-ai/kernel/sdk` author API by default, and not a product capability home. The name **"Extension Kit"** is reserved for a future general substrate for building *all* extensions, third-party included; do not apply it to this first-party kit.
*Avoid*: Extension Kit (reserved name), extension framework, product capability home, neutral-infra gateway, capability-kit core

**Capability API**:
A **Capability**'s curated, typed in-process export at the required `@nseng-ai/<cap>/api` subpath, imported by a **consumer** (downstream) extension (chiefly **CCC**) — never package roots or internals. Added only where a consumer needs it.
*Avoid*: Peer API, sibling API, public API, package-root export, internal subpath, "extension API" (bare)

**Consumer / Provider**:
The directed edge of the **Extension Dependency Graph**: a **consumer** (downstream) extension depends on a **provider** (upstream) extension by importing its **Capability API**. The graph is acyclic — a cycle is debt, not design.
*Avoid*: sibling, peer, peer dependency

**CCC**:
A **first-party extension** (the cmux command-and-control surface) that composes cmux, Graphite, and other first-party extensions through their **Capability APIs**; it is the highest-fan-out **consumer** in the **Extension Dependency Graph** but holds no privileged tier or status.
*Avoid*: orchestrator extension, apex extension, kernel orchestrator

**Package Tier**:
The declared architecture classification of a TypeScript workspace package, stored in its `package.json` at `ns.tier` and enforced by the TypeScript style guard. The canonical live tiers are `neutral-infra`, `sdk`, `capability-kit`, `capability`, `host`, `capability-pi`, `standalone-tool`, `internal-pi-tool`, and `internal-tool`. Hosts and tools are off-axis: hosts present/register/consume capabilities, while tools may depend broadly without becoming part of the Extension Dependency Graph. The former `transitional` and `capability-gateway-backend` tiers are deleted; do not reintroduce a live transitional/backend tier as a debt label.
*Avoid*: hand-authored report color, implied layer, rank-only layer, permanent transitional layer

**Published package**:
The normal npm distribution unit that users install and Node resolves at runtime. A published package may be a **Standalone package** or a **Container package**, so it is not itself always the only architecture boundary.
*Avoid*: topology circle, subpackage, package tier

**Standalone package**:
A **Published package** intentionally kept as one architecture unit rather than as a **Container package**, either because it does not clear the containerization threshold or because its product/distribution role should stay flat.
*Avoid*: flat package, keep-flat package, legacy package

**Container package**:
A **Published package** whose architecture units are **Subpackages** rather than the package as a single flat unit. A container package is properly formed when all of its source belongs to declared subpackages and no **Remainder subpackage** is declared.
*Avoid*: meta-package, bundle package, namespace package, monorepo folder

**Subpackage**:
A package-like architecture unit inside a **Container package**, rooted at `src/<name>/`, declared in the package manifest at `ns.subpackages`, and treated by topology and guard tooling as the import-boundary unit. Multiple runtime subpath exports may belong to one subpackage. Every declared subpackage is an **API subpackage**, **Testing subpackage**, **Host-surface subpackage**, or **Feature subpackage** (ADR 0023); internal layers are folders, not subpackages.
*Avoid*: published package, topology circle, npm package, source folder, internal package, layer

**API subpackage**:
The `api` **Subpackage** of a **Container package**: the sole cross-package programmatic import surface, hosting the package's **Capability API** as a thin contract over the package's internals. Its rank comes from inbound edge significance, not source size.
*Avoid*: core, public API layer, package-root export, second public door

**Testing subpackage**:
The `testing` **Subpackage**: the cross-package test-time contract exporting fakes and test kits, importable by any package's tests and never by runtime code.
*Avoid*: test folder, test utils, mocks folder

**Host-surface subpackage**:
A **Subpackage** that exists because exactly one host consumes it as an entry surface — `ns` (the ns Command Face), `pi` (Pi mirrors), `repo-local-ns-extension` (kernel extension loading) — and that only its host may import. It holds thin per-feature adapters, not domain logic.
*Avoid*: context subpackage, commands, shell, presentation layer

**Feature subpackage**:
A **Subpackage** naming a real domain vertical of a **Container package** (for example `land-stack`, `submit`, `cmux`, `lifecycle`). It is host-free, its dependency edges stay inside the package, and any feature-level `api`/`testing` modules serve sibling subpackages only.
*Avoid*: internal layer, operations, gateways, shared, module folder

**Remainder subpackage**:
The explicitly declared transitional unit for unconverted source in a package being containerized, enabled by `ns.remainder: true`; its membership is the source not claimed by a declared **Subpackage**. A properly formed **Container package** has no remainder.
*Avoid*: miscellaneous folder, hidden subpackage, sentinel entry, `.` subpackage, debt label

**Internal space**:
The private workspace area for repo-local Pi-tool packages: packages under `ts/packages/internal/` using the `@internal/*` scope, marked private, and without outside workspace dependents.
*Avoid*: Local space, experimental area, staging area, sandbox, public package namespace

**Topology circle**:
An architecture topology graph node representing an architecture unit: a **Standalone package**, a **Container package**'s declared **Subpackage**, or its declared **Remainder subpackage** during conversion. Topology circles preserve architectural granularity inside coarse published packages and are sourced from manifests, not directory auto-discovery.
*Avoid*: npm package, package color, hidden package, auto-discovered directory circle

**Topology overlay**:
The architecture-report and guard layer that interprets package manifests as topology circles, tier lanes, package colors, and dependency-boundary facts without turning subdirectories into npm packages.
*Avoid*: package manager, runtime loader, build system
