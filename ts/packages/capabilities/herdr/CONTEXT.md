# @nseng-ai/herdr

`@nseng-ai/herdr` is the private Herdr capability: it drives Herdr workspaces for repo-local sidebar and dispatch flows, using explicit caller-workspace targeting and Herdr-native vocabulary.

## Language

**Herdr capability**:
The first-party **Capability** that drives Herdr workspaces by composing branch, slot, and Pi-session inputs into Herdr workspace operations.
*Avoid*: generic terminal multiplexer wrapper, cmux adapter, Herdr plugin

**Herdr Consumer Gateway**:
The narrow domain-shaped interface (`HerdrGateway`) that exposes only the Herdr workspace operations the capability currently needs, backed by the installed `herdr` CLI.
*Avoid*: raw socket gateway, full Herdr API surface, generic CLI wrapper

**Caller workspace targeting**:
Identifying the Herdr workspace to act on via the `HERDR_WORKSPACE_ID` environment variable injected by Herdr into every managed pane.
*Avoid*: UI focus targeting, ambient workspace, implicit workspace

**Workspace label**:
A display name applied to the caller Herdr workspace via `herdr workspace rename`, derived deterministically from the selected Objective slug.
*Avoid*: sidebar description, metadata reporting, cmux status pill

**Objective sidebar**:
The `/ns:herdr:sidebar:objective-summary` workflow that resolves an Objective slug and applies a label to the caller Herdr workspace.
*Avoid*: cmux sidebar summary, workspace metadata, report-metadata

**Label-only behavior**:
The current `/ns:herdr:sidebar:objective-summary` implementation applies only a workspace label (Objective slug). Slot and branch metadata reporting is deferred because the installed Herdr CLI lacks `workspace report-metadata`.
*Avoid*: partial implementation, missing feature, metadata transport

**Herdr capability boundary**:
The `pi` subpackage is the only Herdr capability subpackage that imports neutral `@nseng-ai/pi/...` host helpers; the `core` feature stays Pi-host independent.
*Avoid*: host-owned Herdr domain, Pi imports from core, package cycle
