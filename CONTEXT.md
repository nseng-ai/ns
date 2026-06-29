# SDL Tools

This context captures project language for durable planning workflows in this repository.

## Language

**Objective**:
A checked-in documentation workstream for durable multi-session, multi-branch, or multi-PR work.
*Avoid*: hidden agent state, ticket

**Synthesis Objective**:
A prose-only **Objective** pattern that coordinates a family of narrower child Objectives while remaining the durable place for cross-child lessons, migration guides, and synthesized closure evidence.
*Avoid*: Fire-and-forget umbrella, mirrored task tracker, hidden parent state, Objective CLI feature

**Child Objective**:
A narrower **Objective** created from a parent **Synthesis Objective** to own one implementation, research, or migration slice; the child remains `open` until its own **Objective Close**, while the parent roadmap may use `[~]` to show that the child exists and is in progress.
*Avoid*: Subticket, hidden task, third Objective status

**Durable Narrative Roadmap Record**:
The role of an **Objective** as human-readable context and ordered work guidance, without owning workflow-control semantics.
*Avoid*: Workflow controller, state machine, task database

**Active Objective Root**:
The checked-in repository directory `.sdl/objectives/` that contains Objective records considered by normal Objective discovery, listing, reading, update, next-work, and close workflows.
*Avoid*: open objectives directory, hidden local cache, archive root

**Objective Archive Root**:
The checked-in repository directory `.sdl/objective-archive/` that parks Objective records outside normal active discovery without changing their slug, prose, updates, or closure marker.
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

## Architecture Boundaries

These terms are general across the codebase. The canonical definitions are replicated here for discoverability; the `typescript-fake-driven-testing` skill carries the fuller mechanics.

**Gateway**:
The canonical interface to an external or non-deterministic capability — process execution, Git, GitHub, filesystem-backed storage, network, the system clock, and timers. Business logic depends on a Gateway rather than on the raw capability, so the Gateway is the single seam where real I/O is replaced by an in-memory fake in tests. External-service boundaries carry the `Gateway` suffix (`ExecGateway`, `GitGateway`, `PRGateway`); small runtime primitives are Gateways by category but named bare (`Clock`, `TimerScheduler`). Filesystem-backed gateways must be domain-specific seams above raw filesystem operations, such as `ObjectiveStorageGateway` or plan-store storage, not a pure/shared `FileSystemGateway`; the domain gateway owns path vocabulary, containment rules, and persistence semantics while its real adapter may use `fs` internally.
*Avoid*: port, generic service locator, dependency-injection bag, pure filesystem gateway, shared `FileSystemGateway`

**Domain logic**:
Deterministic code that consumes one or more **Gateways** to produce or transform domain values, such as assembling a worktree's status from several `ExecGateway` calls. It is not a seam to the outside world: substituting domain logic in a test fakes logic you own, so prefer faking the **Gateway** beneath it. Name domain logic with a domain-specific verb (`load`, `read`, `resolve`, `assemble`, …, chosen for the domain action, not a mandated prefix); do not mint `…Loader` noun-types or a `loaders`/`…Dependencies` collection that dresses stateless functions up as a stateful collaborator.
*Avoid*: business logic, application logic, loader, `…Loader` type, `…Dependencies` injection bag

### Extension Layering

The SDL extension stack, bottom to top: **Neutral Infra** below the SDK (`@sdl/core` as the pure utility library plus other non-domain infra such as `@sdl/clinkr`), the SDK (SDL kernel `@sdl/kernel` + the `sdl-sdk` package), the **Capability Kit**, and the **Capabilities** (first-party **Extensions**) built on it. Real-world/external-tool gateways are not neutral-infra long term: they belong in **Capability Kit** per-domain subpaths. Intrinsic host services expose author-facing interfaces through `sdl-sdk` / `ctx`, with implementations hidden in the kernel. Those first-party extensions form an **Extension Dependency Graph** that must stay acyclic. ADR 0012 holds the layering diagram and the rule that capability domain lives in the capabilities and never in the `@sdl/pi` runtime host or kernel; ADR 0009 holds the dependency-graph invariant; ADR 0018 holds the four-bucket neutral-infra classification rule. The SDK boundary is permeable downward only to concepts that prove general worth. These terms name its parts.

**Pure Utility**:
A deterministic transform with no I/O and no SDL runtime knowledge. Pure utilities stay in `@sdl/core` and may be imported directly by any layer.
*Avoid*: gateway, host service, runtime harness

**Kit Gateway**:
A real-world I/O, external-tool, external-protocol, or precise filesystem-backed gateway/helper that belongs in a per-domain `@sdl/capability-kit/<domain>` subpath with its interface, real adapter, and fake/testing support. It is first-party gateway infrastructure, not product capability domain.
*Avoid*: neutral-infra gateway, product capability, generic filesystem gateway

**SDK-provided service**:
An intrinsic host service reached by extension authors through `ctx` / the vended API object. Its author-facing interface lives in `sdl-sdk`; its implementation is hidden in the kernel. If the author reaches it through the vended API object, classify it as SDK-provided.
*Avoid*: kit gateway, raw process/global import, capability-owned host primitive

**Runtime Harness**:
Program boot code that creates or wires the vended API object and is never reached through `ctx`. Runtime harness code belongs in the kernel or a named neutral CLI-runtime infra home, not in `@sdl/core` long term.
*Avoid*: SDK service, capability API, imported utility

The two leading nouns are orthogonal, not synonyms: an **Extension** is the technical construct; a **Capability** is a feature area implemented as one.

**Extension**:
The technical construct — a package that plugs into the SDK via `defineExtension()`. General and third-party-buildable: a first-party extension implements a **Capability**, but the construct is open to third-party extensions that are not SDL capabilities.
*Avoid*: plugin, built-in, bundled command, "extension API" (bare — write `sdl-sdk` "SDL extension API" or "Pi runtime extension API")

**Capability**:
A first-party SDL feature area (objectives, handoff, slot, flow, …) — a set of domain capabilities packaged as an **Extension** built on the **Capability Kit**. It exposes kernel-loaded CLI/Pi commands, and adds a **Capability API** only when a **consumer** extension depends on it in-process.
*Avoid*: plugin, built-in, the bare construct "extension" (the extension is the mechanism; the capability is the feature area)

**First-party extension**:
An SDL-shipped, SDL-owned **Extension** that implements a **Capability** (flow, objective, handoff, slot, branch-context, plans, address, roaster, aretro, and **CCC**), as opposed to a third-party extension.
*Avoid*: built-in extension, bundled extension (reserve for packaging), core extension

**Capability Kit**:
The shared substrate (`@sdl/capability-kit`) that first-party **Capabilities** are built on — the `ctx`→**Gateway** adapter, shared result/error shapes, first-party per-domain gateway seams/adapters/fakes (`exec`, `git`, `github`, shell, temp-file, and similar precise domains), and small first-party capability-building primitives such as checkpoint/worktree/text helpers when SDK/kernel are the wrong home and transitional debt is the only alternative. It is agnostic about *which* product capability owns domain behavior, not public `sdl-sdk` author API by default, and not a product capability home. The name **"Extension Kit"** is reserved for a future general substrate for building *all* extensions, third-party included; do not apply it to this first-party kit.
*Avoid*: Extension Kit (reserved name), extension framework, product capability home, neutral-infra gateway, capability-kit core

**Capability API**:
A **Capability**'s curated, typed in-process export at the required `@sdl/<cap>/api` subpath, imported by a **consumer** (downstream) extension (chiefly **CCC**) — never package roots or internals. Added only where a consumer needs it.
*Avoid*: Peer API, sibling API, public API, package-root export, internal subpath, "extension API" (bare)

**Consumer / Provider**:
The directed edge of the **Extension Dependency Graph**: a **consumer** (downstream) extension depends on a **provider** (upstream) extension by importing its **Capability API**. The graph is acyclic — a cycle is debt, not design.
*Avoid*: sibling, peer, peer dependency

**CCC**:
A **first-party extension** (the cmux command-and-control surface) that composes cmux, Graphite, and other first-party extensions through their **Capability APIs**; it is the highest-fan-out **consumer** in the **Extension Dependency Graph** but holds no privileged tier or status.
*Avoid*: orchestrator extension, apex extension, kernel orchestrator

**Package Tier**:
The declared architecture classification of a TypeScript workspace package, stored in its `package.json` at `sdl.tier` and enforced by the TypeScript style guard. The canonical live tiers are `neutral-infra`, `sdk`, `capability-kit`, `capability`, `host`, `capability-pi`, `standalone-tool`, and `local-pi-tool`. Hosts and tools are off-axis: hosts present/register/consume capabilities, while tools may depend broadly without becoming part of the Extension Dependency Graph. The former `transitional` tier was deleted with `@sdl/domain-primitives-transitional`; do not reintroduce a live transitional tier as a debt label.
*Avoid*: hand-authored report color, implied layer, rank-only layer, permanent transitional layer
