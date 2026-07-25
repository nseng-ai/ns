# @nseng-ai/herdr

`@nseng-ai/herdr` is the private Herdr capability. It owns Herdr-native space and tab operations and composes ns-owned Git, Graphite, Slots, Saved Plan, Branch Context, and optional Handoff behavior into those resource destinations.

## Language

**Herdr capability**:
The first-party **Capability** that drives Herdr spaces and tabs by composing branch, slot, plan, and Pi-session inputs into Herdr operations.
*Avoid*: generic terminal multiplexer wrapper, cmux adapter, Herdr plugin

**Herdr Consumer Gateway**:
The narrow domain-shaped interface (`HerdrGateway`) exposing only the workspace and tab operations the capability currently needs, backed by the installed `herdr` CLI.
*Avoid*: raw socket gateway, full Herdr API surface, generic CLI wrapper

**Prepared Herdr Dispatch**:
The internal operation that accepts a prepared branch identity, semantic slug, launch command, and workspace-or-caller-tab destination, then owns Slot checkout, destination labeling and creation, explicit pane launch, status, notifications, and structured outcome evidence.
*Avoid*: workflow-specific launch helper, optional or fallback label, separate workspace and tab dispatch pipelines

**Semantic and Git identity invariant**:
A dispatched work item keeps its model-derived normalized semantic slug distinct from its collision-resolved Git branch name. Herdr workspace and tab labels describe the work using the semantic slug; Git, Graphite, Branch Memory, and Slot operations use the actual branch name. Workspace labels may prefix the semantic slug with the compact slot derived from the actual checked-out worktree path; tab labels are exactly the semantic slug.
*Avoid*: collision suffix as display identity, branch name as tab label, guessed dry-run slot prefix

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

**Contextual launch branch basis**:
The invocation-time policy shared by prompt-to-space, plan-to-space, and plan-to-tab. Named `main` or `master` selects the existing local Graphite trunk automatically; another named branch offers Current branch (`<name>`) or Local trunk; detached HEAD or current-branch lookup failure offers confirmed local-trunk fallback. Herdr never fetches or refreshes trunk: callers update local trunk separately before launch when desired. Required interaction without UI and user cancellation both stop before downstream mutation. Plan-to-tab validates and captures caller space identity before Git inspection or interaction.
*Avoid*: command-name branch basis, `--from` override, refreshed trunk, implicit fetch, silent noninteractive default, duplicated prompt/plan selection policy

**Herdr command catalog**:
The nine-command Pi surface has six direct resource operations (`space:{new,goal,objective-summary}` and `tab:{new,goal,handoff}`) plus `/ns:herdr:launch:prompt:space`, `/ns:herdr:launch:plan:space`, and `/ns:herdr:launch:plan:tab`. The eight non-Handoff commands are base registrations; `tab:handoff` is the only optional registration. The five former `br`/`tr` launch names have no visible or hidden compatibility aliases.
*Avoid*: workflow-family catalog, compound dispatch action names, branch-basis command segment, `/ns:herdr:handoff:*`, `/ns:herdr:objective:*`, `tab:plan-dispatch`

**Herdr capability boundary**:
The `pi` subpackage is the only Herdr capability subpackage that imports neutral `@nseng-ai/pi/...` host helpers; `ns` composes hidden reference-based commands and real same-channel gateways; core stays host-independent.
*Avoid*: host-owned Herdr domain, Pi imports from core, package cycle
