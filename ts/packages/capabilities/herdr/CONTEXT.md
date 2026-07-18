# @nseng-ai/herdr

`@nseng-ai/herdr` is the private Herdr capability: it owns Herdr-native workspace and surface destinations for repo-local sidebar and dispatch flows. It consumes ns-owned Git/Graphite/Branch Memory and Saved Plan/Branch Context preparation.

## Language

**Herdr capability**:
The first-party **Capability** that drives Herdr workspaces by composing branch, slot, and Pi-session inputs into Herdr workspace operations.
*Avoid*: generic terminal multiplexer wrapper, cmux adapter, Herdr plugin

**Herdr Consumer Gateway**:
The narrow domain-shaped interface (`HerdrGateway`) that exposes only the Herdr workspace operations the capability currently needs, backed by the installed `herdr` CLI.
*Avoid*: raw socket gateway, full Herdr API surface, generic CLI wrapper

**New space**:
The focused Herdr workspace created by `/ns:herdr:space:new` at the Pi command's current working directory; an optional natural-language description is interpreted by the configured slug model into a flat semantic workspace label.
*Avoid*: dispatch workspace, slot checkout, raw workspace-create wrapper, deterministic label fallback

**Caller workspace targeting**:
Identifying the Herdr workspace to act on via the `HERDR_WORKSPACE_ID` environment variable injected by Herdr into every managed pane. Surface dispatch validates and captures this ID immediately after argument/help handling, before plan lookup or durable mutation.
*Avoid*: UI focus targeting, ambient workspace, implicit workspace

**Workspace label**:
A display name applied to the caller Herdr workspace via `herdr workspace rename`. The compact Slot prefix (`s<number>:`) requires two independent facts: the cwd has the canonical managed-Slot path shape (path identity) and the Slots capability probe succeeds (capability availability); otherwise the label stays unprefixed (`obj:<objective-slug>`, bare goal slug). This composition is provisional pending a Herdr workflow pluggability point.
*Avoid*: sidebar description, metadata reporting, unconditional slot prefix, path-shape-only prefix

**Slots capability probe**:
The narrow Herdr-owned injectable predicate (`HasHerdrSlotsCapability`) answering whether Slot label enrichment is available. The Pi implementation adapts a complete, invocation-owned ns extension API and asks `hasExtension("@nseng-ai/slots")`. The project-local adapter explicitly composes the Herdr registrar with the ns-host factory; construction failure degrades optional enrichment to unavailable. Herdr core receives only the predicate, not the complete API.
*Avoid*: universal capability detector, Pi command-surface inference, package resolvability check, subprocess probe, private registry inspection, SDK API threaded into core

**Objective sidebar**:
The `/ns:herdr:sidebar:objective-summary` workflow that resolves an Objective slug and applies the workspace label to the caller Herdr workspace.
*Avoid*: cmux sidebar summary, workspace metadata, report-metadata

**Label-only behavior**:
The current `/ns:herdr:sidebar:objective-summary` implementation applies only a workspace label. Slot identity may be encoded in that label when the cwd proves it is a managed ns slot and the Slots capability probe confirms availability; capability presence probing is permitted, while branch reads, Slot inventory reads, and metadata reporting remain deferred. Dispatch and open-branch flows stay Slot-backed and required today; broader host pluggability is direction, not current behavior.
*Avoid*: partial implementation, inferred slot from arbitrary basename, metadata transport

**Herdr capability boundary**:
The `pi` subpackage is the only Herdr capability subpackage that imports neutral `@nseng-ai/pi/...` host helpers; the `core` feature stays Pi-host independent.
*Avoid*: host-owned Herdr domain, Pi imports from core, package cycle
