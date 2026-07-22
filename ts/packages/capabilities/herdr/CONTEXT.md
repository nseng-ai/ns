# @nseng-ai/herdr

`@nseng-ai/herdr` is the private Herdr capability. It owns Herdr-native space and tab operations and composes ns-owned Git, Graphite, Slots, Saved Plan, Branch Context, and optional Handoff behavior into those resource destinations.

## Language

**Herdr capability**:
The first-party **Capability** that drives Herdr spaces and tabs by composing branch, slot, plan, and Pi-session inputs into Herdr operations.
*Avoid*: generic terminal multiplexer wrapper, cmux adapter, Herdr plugin

**Herdr Consumer Gateway**:
The narrow domain-shaped interface (`HerdrGateway`) exposing only the workspace and tab operations the capability currently needs, backed by the installed `herdr` CLI.
*Avoid*: raw socket gateway, full Herdr API surface, generic CLI wrapper

**Herdr space**:
The Herdr workspace resource addressed by `/ns:herdr:space:*` commands. Space commands create or rename a workspace, or dispatch work into a newly created workspace. Plan dispatch labels the new space with the content-derived branch-context slug so its displayed name describes the planned work.
*Avoid*: workflow family, dispatch workspace as a separate resource kind, cmux workspace, command-and-source-branch sentence as a plan-dispatch label

**Herdr tab**:
A tab resource inside a Herdr space, addressed by `/ns:herdr:tab:*` commands. Commands that mutate or launch into the caller's tab or space resolve explicit Herdr caller identity before doing dependent work.
*Avoid*: surface, pane, workflow family, implicit focused tab

**New space**:
The focused Herdr space created by `/ns:herdr:space:new` at the Pi command's current working directory. An optional natural-language description is interpreted by the configured slug model into a flat semantic label.
*Avoid*: dispatch space, slot checkout, raw workspace-create wrapper, deterministic label fallback

**New tab**:
The focused Herdr tab created by `/ns:herdr:tab:new` in the caller space at the Pi command's current working directory. An optional natural-language description is interpreted by the configured slug model into a semantic label.
*Avoid*: new space, implicit focused workspace, raw tab-create wrapper

**Space goal**:
The `/ns:herdr:space:goal` operation that interprets a goal and renames the explicit caller space with the shared goal-label policy.
*Avoid*: objective summary, metadata report, tab goal

**Tab goal**:
The `/ns:herdr:tab:goal` operation that interprets a goal and renames the explicit caller tab with the shared goal-label policy.
*Avoid*: space goal, UI-focus targeting, workspace rename

**Herdr Handoff tab**:
The optional `/ns:herdr:tab:handoff` integration with `@nseng-ai/handoffs`. The Handoff Pi create flow owns Handoff Artifact composition, content-derived slugging, and persistence; the hidden reference-based `ns herdr exec handoff-tab launch` command verifies the stored artifact by branch and slug before Herdr creates a focused labeled tab and launches pickup in its root pane. Registration is conditional on the curated Handoffs Pi integration being available.
*Avoid*: generic Herdr handoff workflow family, model-facing launch tool, Markdown transport through Herdr, Handoffs-owned destination, compatibility alias

**Caller space targeting**:
Identifying the Herdr space to act on through `HERDR_WORKSPACE_ID`, injected by Herdr into a managed pane. Space rename and tab-creation/dispatch flows validate and capture this ID before dependent work or destination mutation.
*Avoid*: UI focus targeting, ambient workspace, implicit workspace

**Caller tab targeting**:
Identifying the exact Herdr tab to rename through `HERDR_TAB_ID`, injected by Herdr into a managed pane. Tab rename flows validate this ID before model work or mutation and never substitute `HERDR_WORKSPACE_ID` or UI focus.
*Avoid*: caller space ID, focused tab, current tab inference

**Goal label**:
A display label derived from a user goal and applied with `herdr workspace rename` or `herdr tab rename`: `s<number>:<goal-slug>` in a managed ns slot and `<goal-slug>` otherwise.
*Avoid*: metadata description, Objective label, unconditional slot prefix

**Objective space summary**:
The `/ns:herdr:space:objective-summary` workflow that resolves an Objective slug and labels the explicit caller space `s<number>:obj:<objective-slug>` in a managed ns slot and `obj:<objective-slug>` otherwise.
*Avoid*: sidebar workflow family, workspace metadata report, generic workspace summary

**Label-only behavior**:
The current `/ns:herdr:space:objective-summary` implementation applies only a workspace label. Branch metadata reporting remains deferred.
*Avoid*: metadata transport, inferred slot from arbitrary basename, partial cmux parity

**Resource-first Herdr command catalog**:
The eleven-command Pi surface organized by destination resource: seven space commands (`new`, `goal`, `objective-summary`, `prompt`, `trunk-prompt`, `plan`, `trunk-plan`) and four tab commands (`new`, `goal`, `plan`, `handoff`). The destination resource already implies dispatch, so prompt/plan command names prioritize their payload and put the optional `trunk` basis first. `tab:handoff` is the only optional registration.
*Avoid*: workflow-family catalog, redundant `dispatch` action names, `/ns:herdr:handoff:*`, `/ns:herdr:objective:*`, `tab:plan-dispatch`

**Herdr capability boundary**:
The `pi` subpackage is the only Herdr capability subpackage that imports neutral `@nseng-ai/pi/...` host helpers; `ns` composes hidden reference-based commands and real same-channel gateways; core stays host-independent.
*Avoid*: host-owned Herdr domain, Pi imports from core, package cycle
