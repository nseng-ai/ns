# @nseng-ai/herdr

`@nseng-ai/herdr` is the private Herdr capability: it owns Herdr-native workspace and surface destinations for repo-local sidebar and dispatch flows. It consumes ns-owned Git/Graphite/Branch Memory and Saved Plan/Branch Context preparation.

## Language

**Herdr capability**:
The first-party **Capability** that drives Herdr workspaces by composing branch, slot, and Pi-session inputs into Herdr workspace operations.
*Avoid*: generic terminal multiplexer wrapper, cmux adapter, Herdr plugin

**Herdr Consumer Gateway**:
The narrow domain-shaped interface (`HerdrGateway`) that exposes only the Herdr workspace operations the capability currently needs, backed by the installed `herdr` CLI.
*Avoid*: raw socket gateway, full Herdr API surface, generic CLI wrapper

**Caller workspace targeting**:
Identifying the Herdr workspace to act on via the `HERDR_WORKSPACE_ID` environment variable injected by Herdr into every managed pane. Surface dispatch validates and captures this ID immediately after argument/help handling, before plan lookup or durable mutation.
*Avoid*: UI focus targeting, ambient workspace, implicit workspace

**Workspace label**:
A display name applied to the caller Herdr workspace via `herdr workspace rename`, derived deterministically from the selected Objective slug.
*Avoid*: combined Objective/slot label, cmux status pill

**Caller pane title**:
The current slot name applied through `herdr pane report-metadata` to the explicit `HERDR_PANE_ID`; Herdr renders it beneath the workspace label in the left rail.
*Avoid*: focused pane, workspace metadata, branch suffix

**Objective sidebar**:
The `/ns:herdr:sidebar:objective-summary` workflow that resolves an Objective slug, labels the caller workspace, and titles the caller pane with its slot.
*Avoid*: cmux sidebar summary, generic workspace summary, implicit pane targeting

**Herdr capability boundary**:
The `pi` subpackage is the only Herdr capability subpackage that imports neutral `@nseng-ai/pi/...` host helpers; the `core` feature stays Pi-host independent.
*Avoid*: host-owned Herdr domain, Pi imports from core, package cycle
