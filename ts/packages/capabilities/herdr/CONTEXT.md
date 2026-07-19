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

**Handoff workflow family**:
The integrated `/ns:herdr:handoff:*` namespace for existing dispatch behavior. It composes native Herdr space or tab destinations with other ns capabilities; the namespace alone does not imply creation of a Handoff Artifact.
*Avoid*: Handoff Artifact creation by default, replacement for native space/tab vocabulary, generic destination abstraction

**Herdr Handoff tab**:
The optional `/ns:herdr:handoff:tab` integration with `@nseng-ai/handoffs`: the Handoffs Pi create flow owns artifact composition, content-derived slugging, and persistence; the hidden reference-based `ns herdr exec handoff-tab launch` command verifies the stored artifact by branch and slug before Herdr creates the focused labeled tab and launches pickup in its root pane. The Pi workflow registers only when the curated Handoffs Pi integration module is resolvable, while the ns command composes the Handoffs Capability API directly.
*Avoid*: model-facing launch tool, Markdown transport through Herdr, Handoffs-owned destination, generic multiplexer launcher, compatibility alias

**Caller workspace targeting**:
Identifying the Herdr workspace to act on via the `HERDR_WORKSPACE_ID` environment variable injected by Herdr into every managed pane. Surface dispatch and Herdr Handoff tab validate and capture this ID before plan/artifact work or destination mutation.
*Avoid*: UI focus targeting, ambient workspace, implicit workspace

**Workspace label**:
A display name applied to the caller Herdr workspace via `herdr workspace rename`: `s<number>:obj:<objective-slug>` in a managed ns slot and `obj:<objective-slug>` otherwise. This composition is provisional pending a Herdr workflow pluggability point.
*Avoid*: sidebar description, metadata reporting, unconditional slot prefix

**Objective sidebar**:
The `/ns:herdr:objective:sidebar-summary` workflow that resolves an Objective slug and applies the workspace label to the caller Herdr workspace.
*Avoid*: cmux sidebar summary, workspace metadata, report-metadata

**Label-only behavior**:
The current `/ns:herdr:objective:sidebar-summary` implementation applies only a workspace label. Slot identity may be encoded in that label when the cwd proves it is a managed ns slot; branch metadata reporting remains deferred.
*Avoid*: partial implementation, inferred slot from arbitrary basename, metadata transport

**Herdr capability boundary**:
The `pi` subpackage is the only Herdr capability subpackage that imports neutral `@nseng-ai/pi/...` host helpers; `ns` composes the hidden reference-based command and real same-channel gateways; the `core` feature stays host-independent.
*Avoid*: host-owned Herdr domain, Pi imports from core, package cycle
