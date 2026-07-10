# ns

This context captures project language for durable planning workflows in this repository.

## Language

**ns**:
The product's proper name. Always lowercase, including at sentence starts; rewrite the sentence rather than capitalizing it. It evokes nonslop, namespace, and Nick Schrock's initials.
*Avoid*: NS, Ns, JI, Ji, SDL, Source Development Lifecycle

**Objective**:
A checked-in documentation workstream for durable multi-session, multi-branch, or multi-PR work.
*Avoid*: hidden agent state, ticket

**Umbrella Objective**:
A prose-only **Objective** pattern that coordinates a family of narrower **Subobjectives** while remaining the durable place for cross-child lessons, migration guides, and synthesized closure evidence. The synthesis duty is part of the pattern, not optional (renamed from Synthesis Objective per `docs/adr/0030-rename-synthesis-objective-to-umbrella-objective.md`).
*Avoid*: Synthesis Objective (retired name), fire-and-forget umbrella, mirrored task tracker, hidden parent state, Objective CLI feature

**Subobjective**:
A narrower **Objective** created from a parent **Umbrella Objective** to own one implementation, research, or migration slice; renamed from Child Objective (2026-07-06), which remains a valid synonym. The subobjective remains `open` until its own **Objective Close**, while the parent roadmap may use `[~]` to show that it exists and is in progress.
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
A roadmap row in an **Ideation Objective** that is an open decision or investigation rather than executable work, typed as one of grilling, research, prototype, or task, carrying explicit blocked-by references to other rows, and sized to one agent session. Grilling and prototype rows resolve only through live exchange with the user; research rows are agent-alone; task rows may be either — prose guidance, not machine state.
*Avoid*: ticket, task-tracker item, execution row, subissue

**Frontier**:
The open, unblocked **Question Rows** of an **Ideation Objective** — the questions answerable now. Resolving a frontier row records the decision, may unblock other rows, and graduates any **Fog** the answer made specifiable into new rows.
*Avoid*: backlog, task queue, next-up list

**Fog**:
The deliberately coarse view of decisions an **Ideation Objective** can tell are coming but cannot yet phrase sharply, held as a marked cluster under `## Open Questions` and never pre-sliced into rows. The test against a **Question Row**: can the question be stated precisely now — not answered. Fog gathers only toward the **Destination**: work ruled beyond it is not Fog and never graduates — it belongs in non-goals prose.
*Avoid*: sharp open question, hidden backlog, placeholder rows

**Crystallization**:
The phase exit of an **Ideation Objective**: the **Frontier** empties of **Question Rows** and the remaining roadmap is ordinary execution work. Crystallization is a recognizable condition, not a status, marker, or ceremony.
*Avoid*: closure, third Objective status, graduation ceremony

**Orienting Objective**:
A prose-only **Objective** pattern defined by carrying `orientation.md`: a standing, agent-facing rule stating the direction every agent — including agents on unrelated work — must respect while the record is open. The orientation joins the always-load set (`ns objective exec load-orientations`) and leaves it automatically at closure. The name is what it does: it orients agents.
*Avoid*: Cross-cutting Objective (retired name), orientation-bearing Objective, ambient Objective, orientation registry

**Steelthread Objective**:
A prose-only **Objective** pattern whose scope is deliberately the thinnest end-to-end slice of a larger ambition — one real task completing through every layer of the real system, with widening explicitly deferred to follow-on work. The thread validated end-to-end is the completion criterion; the pattern names the whole record's scope, not a steelthread milestone row inside a broader Objective.
*Avoid*: MVP, prototype, spike, proof of concept, walking skeleton, thin slice, tracer bullet

**Durable Narrative Roadmap Record**:
The role of an **Objective** as human-readable context and ordered work guidance, without owning workflow-control semantics.
*Avoid*: Workflow controller, state machine, task database

**Active Objective Root**:
The checked-in repository directory `.ns/objectives/` that contains Objective records considered by normal Objective discovery, listing, reading, update, next-work, and close workflows. Records leave active checkout state by ordinary source-control deletion.
*Avoid*: open objectives directory, hidden local cache, parking root, tombstone store

**Deleted Objective Record**:
An **Objective** record removed from `.ns/objectives/` through ordinary source control. It is absent from Objective discovery; git history is the recovery mechanism.
*Avoid*: parked objective, closed objective, stale update, hidden tombstone

**Objective Slug**:
The directory name under the **Active Objective Root** that is the stable identity for one **Objective** while the record exists in the checkout.
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
The explicit mutation workflow that records an objective as complete or intentionally abandoned while preserving its checked-in active-root record and writing a **Closure Marker**.
*Avoid*: Deletion, separate parking state machine

**Closure Marker**:
A lightweight `closed.md` file whose existence lets tools identify closed objectives without language-model interpretation.
*Avoid*: Hidden status, parking state, deletion

**Record Frontmatter**:
An optional YAML block at the top of an **Objective**'s `objective.md` carrying exactly two keys — `blocked` (the **Blocked Sentence**) and `edges` (**Objective Edges**) — and nothing else (ADR 0025). Most records have none; every `objective.md` reader strips or parses the block and behaves identically for records with and without it.
*Avoid*: general metadata block, execution-policy store, extra frontmatter keys, hidden attachment metadata, registry

**Objective Edge**:
An undirected, kind-less, mirrored connection between two **Objective** records, listed in both endpoints' **Record Frontmatter** as `{objective: <slug>, annotation: <sentence>}`. Edge identity is the unordered slug pair, with at most one edge between two records; direction, causality, and relationship kind live in the **Edge Annotation** prose, never the schema. Mutation is skill-owned, and deleting an endpoint makes the counterpart missing until the edge is updated or the record is recovered from git history.
*Avoid*: typed edge kind, `to:`/`from:` directionality, single-sided edge, machine-readable dependency link

**Edge Annotation**:
The required prose sentence each endpoint of an **Objective Edge** carries in its own **Record Frontmatter**, written from that record's perspective. The two sides are deliberately different texts — perspective is the payload, so a shared string would lose exactly the information the edge exists to carry.
*Avoid*: shared edge label, edge kind, machine-readable edge semantics, optional comment

**Blocked Sentence**:
The prose-valued `blocked:` key in **Record Frontmatter**: presence means the record is blocked (for any reason — another objective, an external gate) and the value says why. There is no boolean — the sentence is the state — and it is set and cleared only by skill judgment, never by machine auto-flip.
*Avoid*: blocked boolean, machine-derived flag, lifecycle state, status ping

Objective state vocabulary clusters as: open vs. closed is the lifecycle state (the **Closure Marker** decides closed), present vs. deleted is ordinary source-controlled checkout state, and blocked — the presence of a **Blocked Sentence** — is a sub-state of open, not a third lifecycle state.

**Harness artifact**:
An ns-owned resource materialized into an assistant **Harness**; current kinds are `skill`, `agent`, and `extension-bundle`. Handoff artifacts and consumer artifacts are separate domain terms, so qualify this term when ambiguity is possible.
*Avoid*: bare artifact where ambiguous, managed artifact

**Harness**:
A target assistant environment for a **Harness artifact**, currently `claude-code`, `codex`, or `pi`. This is distinct from **Runtime Harness**, which names program boot code that wires the vended API object.
*Avoid*: platform

**Provision**:
The action that materializes a **Harness artifact** into a **Harness** root.
*Avoid*: install where it means provisioning, deploy

**Skills**:
The user-facing CLI noun for `ns skills ...`, the current steelthread surface over `skill` **Harness artifact** provisioning.
*Avoid*: artifacts as the user-facing noun

**Harness overlay**:
Per-invocation-kind harness integration files reconciled by areg, such as frontmatter flags, Codex sidecars, Pi settings exclusions, and mirror symlinks. Harness overlays are the seam where repo-owned invocation policy layers onto first-party or externally sourced skill content.
*Avoid*: managed artifacts, kind overlays

**Commit Run**:
A linear, merge-free commit sequence on one feature branch off trunk — the branch is the run, `trunk..tip`, with no run identity beyond it. Packageable when its tip validates and its commit messages narrate intent well enough for **Packaging** to judge slice boundaries; there are no structured decision markers — narrative prose is the signal.
*Avoid*: run registry, run manifest, decision trailer, marked commit

**Packaging**:
The opt-in, LM-driven local operation (colloquially *smush*, the skill's name) that classifies and slices any existing stack into **Decision PR** and **Span PR** form, then explicitly performs **Span Squash**. It produces a self-describing local stack for the user to submit; repackaging is the same operation re-run, never an automatic pipeline or land step.
*Avoid*: accretion, automatic pipeline stage, deterministic slicer, submit step, land-time step

**Decision PR**:
A packaged stack slice encoding one high-impact choice plus the commits needed to judge it in isolation. Its local branch name and commit message carry classification and rationale; after submission its `decision` label and body request careful human review.
*Avoid*: big PR, important-looking PR, unlabeled review request

**Span PR**:
A packaged stack slice holding a maximal stretch of consequence-executing commits between decisions. Its local name and squashed commit carry classification, rationale, and narration; after submission its `span` label makes agent review visibly stand in by default.
*Avoid*: filler PR, silently-unreviewed PR, auto-squashed PR

**Slice Map**:
The derived view of a packaged stack's cut points, decision/span classification, and rationale, reconstructed from branch structure, names, and commit messages. It is never stored as durable state; after submission the user ratifies it by reshaping the stack on disagreement.
*Avoid*: PR plan file, hidden packaging state, approval gate

**Span Squash**:
The standard explicit Packaging step that collapses a **Span PR**'s interior commits into one after slicing and boundary validation, preserving rationale and a narration digest. It manages the live stack's conflict surface and is never a land-time operation.
*Avoid*: auto-squash, implicit squash, land-time squash

## Architecture Boundaries

These terms are general across the codebase. The canonical definitions are replicated here for discoverability; the `typescript-fake-driven-testing` skill carries the fuller mechanics.

**Gateway**:
The canonical interface to an external or non-deterministic capability — process execution, Git, GitHub, filesystem-backed storage, network, the system clock, and timers. Business logic depends on a Gateway rather than on the raw capability, so the Gateway is the single seam where real I/O is replaced by an in-memory fake in tests. External-service boundaries carry the `Gateway` suffix (`ExecGateway`, `GitGateway`, `PRGateway`); small runtime primitives are Gateways by category but named bare (`Clock`, `TimerScheduler`). Filesystem-backed gateways must be domain-specific seams above raw filesystem operations, such as `ObjectiveStorageGateway` or plan-store storage, not a pure/shared `FileSystemGateway`; the domain gateway owns path vocabulary, containment rules, and persistence semantics while its real adapter may use `fs` internally. This remains true when the current implementation is thin: the seam still speaks in domain objects and operations rather than raw file reads, directory listings, or path stats.
*Avoid*: port, generic service locator, dependency-injection bag, pure filesystem gateway, shared `FileSystemGateway`, substrate-shaped capability gateway

**Domain logic**:
Deterministic code that consumes one or more **Gateways** to produce or transform domain values, such as assembling a worktree's status from several `ExecGateway` calls. It is not a seam to the outside world: substituting domain logic in a test fakes logic you own, so prefer faking the **Gateway** beneath it. Name domain logic with a domain-specific verb (`load`, `read`, `resolve`, `assemble`, …, chosen for the domain action, not a mandated prefix); do not mint `…Loader` noun-types or a `loaders`/`…Dependencies` collection that dresses stateless functions up as a stateful collaborator.
*Avoid*: business logic, application logic, loader, `…Loader` type, `…Dependencies` injection bag

### Extension Layering

The ns extension stack, bottom to top: **Neutral Infra** below the SDK (`@nseng-ai/foundation` as the generic infrastructure library plus other non-domain infra such as `@nseng-ai/clinkr`), the SDK (`@nseng-ai/kernel` plus its `sdk` subpackage), the **Capability Kit**, and the **Capabilities** (first-party **Extensions**) built on it. ns-shaped external-tool gateways live as **Capability Kit** subpackages such as `@nseng-ai/capability-kit/git`, `@nseng-ai/capability-kit/github`, `@nseng-ai/capability-kit/graphite`, and `@nseng-ai/capability-kit/cmux`; the former standalone **Capability Gateway Backend** tier is retired. A gateway whose public contract is ns-independent with a credible external-consumer scenario may instead be **Neutral Infra** owned by foundation (ADR 0032) — `@nseng-ai/foundation/exec` is the live example; existing Kit Gateways stay put absent explicit follow-up work. Intrinsic host services expose author-facing interfaces through `@nseng-ai/kernel/sdk` / `ctx`, with implementations hidden in the kernel. Those first-party extensions form an **Extension Dependency Graph** that must stay acyclic. ADR 0012 holds the layering diagram and the rule that capability domain lives in the capabilities and never in the `@nseng-ai/pi` runtime host or kernel; ADR 0009 holds the dependency-graph invariant; ADR 0018 holds the four-bucket neutral-infra classification rule, refined by ADR 0019's package-placement gate (which concrete package owns a large real gateway implementation, and whether it folds into Capability Kit or stays standalone/deferred) and by ADR 0032's external-applicability admission test. The SDK boundary is permeable downward only to concepts that prove general worth. ADR 0031 holds the point-system decision. These terms name its parts.

**Point**:
A named place an **Extension** defines where consumer config alters platform behavior. A point may be used at an SDLC lifecycle moment, but the mechanism is lifecycle-agnostic; "lifecycle point" is prose framing, not a separate concept.
*Avoid*: unqualified extension point, hook point, event, moment, slot, phase, step, stage, checkpoint, seam

**Hook**:
A script command installed at a **Point** and run by the owning workflow.
*Avoid*: prompt, shell snippet, LM instruction

**Prompt**:
Pure LM content installed at a **Point** and resolved by the platform for the defining workflow to consume. The point system never executes prompts.
*Avoid*: hook, script, agent task

**Define**:
The extension-author action of declaring a **Point**.
*Avoid*: consumer defines a point, installs a point

**Install**:
The consumer action of configuring a **Hook** or **Prompt** at a **Point**.
*Avoid*: define, register, enable extension code

**Point catalog**:
The kernel-computed view that joins point definitions with consumer installations and diagnostics. Catalog is the point-system word; **Registry** remains areg vocabulary.
*Avoid*: registry, hook registry, prompt registry
**Neutral Infra**:
The floor below the SDK — packages/subpackages that depend only on other Neutral Infra (`@nseng-ai/foundation`, `@nseng-ai/foundation/exec`, `@nseng-ai/foundation/cli-theme`, `@nseng-ai/clinkr`). Neutral means independent of ns, not effect-free: a surface qualifies when its public contract is ns-independent and its design states a credible external-consumer scenario (ADR 0032); it may perform real-world I/O. **Pure Utility** is the narrower term for its deterministic, I/O-free members. ns-shaped gateways remain **Kit Gateway** material; a gateway passing the external-applicability test may be Neutral Infra owned by foundation.
*Avoid*: pure floor, purity-defined neutral infra, "no real-world I/O" as the admission test, hypothetical genericity without a stated consumer scenario, foundation (the package) as a synonym for the tier

**Pure Utility**:
A deterministic transform with no I/O and no ns runtime knowledge — the effect-free subset of **Neutral Infra**, no longer synonymous with all of it. Pure utilities stay in `@nseng-ai/foundation` and may be imported directly by any layer.
*Avoid*: gateway, host service, runtime harness, synonym for Neutral Infra

**Kit Gateway**:
The per-domain *seam* for an ns-shaped external-tool, external-protocol, or precise filesystem-backed gateway — its contract, fake/testing support, `ctx`→gateway adapter, and real adapter — owned at `@nseng-ai/capability-kit/<domain>`. It is first-party ns extension-building substrate, not product capability domain. Performing I/O does not by itself make a gateway Kit material: a gateway with an ns-independent contract and a credible external-consumer scenario may be **Neutral Infra** instead (ADR 0032); reclassifying an existing Kit Gateway requires explicit follow-up work.
*Avoid*: product capability, generic filesystem gateway, "gateway is never Neutral Infra"

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

**Noun-oriented extension**:
An **Extension** whose command-group slug names the singular domain noun users operate on, not the package name and not an implementation acronym. Prefer stable domain nouns that read like ns command families — `ns objective ...`, `ns handoff ...`, `ns retro ...` — even when the npm package is plural for package-naming reasons (`@nseng-ai/objectives`, `@nseng-ai/handoffs`, `@nseng-ai/retros`). Use plural command groups only when the domain noun is genuinely plural or collection-shaped in user language. This term governs command-facing vocabulary, not TypeScript symbol names or npm package identity.
*Avoid*: package-oriented command group, implementation acronym command group, plural-by-package-name, CLI family named after the package

**Capability**:
A first-party ns feature area (objectives, handoff, slot, flow, …) — a set of domain capabilities packaged as an **Extension** built on the **Capability Kit**. It exposes kernel-loaded CLI/Pi commands, and adds a **Capability API** only when a **consumer** extension depends on it in-process.
*Avoid*: plugin, built-in, the bare construct "extension" (the extension is the mechanism; the capability is the feature area)

**First-party extension**:
An ns-shipped, ns-owned **Extension** that implements a **Capability** (flow, objective, handoff, slot, branch-context, plans, address, reviews, retro, and **CCC**), as opposed to a third-party extension.
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
The declared architecture classification of a TypeScript workspace package, stored in its `package.json` at `ns.tier` and enforced by the TypeScript style guard. The canonical live tiers are `neutral-infra`, `sdk`, `capability-kit`, `capability`, `host`, `capability-pi`, `standalone-tool`, `internal-pi-tool`, and `internal-tool`. A package lives in a single tier: `ns.tier` is the tier for the package and every declared **Subpackage**, `ns.subpackageTiers` overrides are rejected by the guard, and cross-package layering is enforced against the owning package's tier for every **Topology circle** (ADR 0032). Hosts and tools are off-axis: hosts present/register/consume capabilities, while tools may depend broadly without becoming part of the Extension Dependency Graph. The former `transitional` and `capability-gateway-backend` tiers are deleted; do not reintroduce a live transitional/backend tier as a debt label, and do not add a `platform` tier for I/O-performing Neutral Infra.
*Avoid*: hand-authored report color, implied layer, rank-only layer, permanent transitional layer, subpackage tier override, effective subpackage tier

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
A package-like architecture unit inside a **Container package**, rooted at `src/<name>/`, declared in the package manifest at `ns.subpackages`, and treated by topology and guard tooling as the import-boundary unit. Multiple runtime subpath exports may belong to one subpackage. Every declared subpackage is an **API-kind subpackage**, **Testing subpackage**, **Host-surface subpackage**, or **Feature subpackage** (ADR 0023, refined by ADR 0032); internal layers are folders, not subpackages.
*Avoid*: published package, topology circle, npm package, source folder, internal package, layer

**API-kind subpackage**:
A declared **Subpackage** with supported cross-package runtime exports, regardless of its name — a **Container package** may have several, each earning its rank from the inbound edge class it anchors, not source size (ADR 0032). Foundation's precise public doors (`exec`, `time`, …) are API-kind. The literal `api` subpackage is the required naming specialization for a **Capability API**, where capability consumer/provider rules apply. Private implementation features stay folders inside the owning API-kind subpackage.
*Avoid*: API subpackage as a synonym for the literal `api` kind, core, public API layer, package-root export, sole cross-package programmatic import surface, giant façade barrel

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
