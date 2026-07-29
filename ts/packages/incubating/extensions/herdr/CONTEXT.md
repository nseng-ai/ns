# @nseng-ai/herdr

`@nseng-ai/herdr` is the private, harness-independent Herdr extension. It owns Herdr-native space and tab operations, explicit targeting, labels, prepared destinations, and pane process launch. Pi command orchestration is owned by `@nseng-ai/pi-ns-herdr`.

## Language

**Herdr extension**:
The **first-party extension** that owns Herdr spaces, tabs, labels, explicit caller targeting, prepared destinations, and pane process launch.
*Avoid*: Herdr capability (retired name), generic terminal multiplexer wrapper, cmux adapter, Herdr plugin

**Herdr Consumer Gateway**:
The narrow domain-shaped interface (`HerdrGateway`) exposing only the workspace and tab operations the extension currently needs, backed by the installed `herdr` CLI.
*Avoid*: raw socket gateway, full Herdr API surface, generic CLI wrapper

**Prepared Herdr Launch**:
The internal operation that accepts a prepared branch identity, semantic slug, launch command, and workspace-or-caller-tab destination, then owns Slot checkout, destination labeling and creation, explicit pane launch, status, notifications, and structured outcome evidence.
*Avoid*: workflow-specific launch helper, optional or fallback label, separate workspace and tab dispatch pipelines

**Semantic and Git identity invariant**:
A launched work item keeps its model-derived normalized semantic slug distinct from its collision-resolved Git branch name. Prepared Herdr Launch labels use the actual collision-resolved branch name so the displayed destination matches the branch used by Git, Graphite, Branch Memory, and Slot operations. Managed-Slot space labels prefix that branch name with the compact slot derived from the actual checked-out worktree path; tab labels use the branch name without a Slot prefix.
*Avoid*: semantic slug as implementation destination label, Slot-prefixed tab label, guessed dry-run slot prefix

**Herdr space**:
The Herdr resource addressed by `/ns:herdr:space:*` commands. Space commands create or rename a space; implementation workflows may use a newly created space as their destination. Plan implementation labels the new space with the content-derived branch-context slug so its displayed name describes the planned work.
*Avoid*: workflow family, workspace (except `HERDR_WORKSPACE_ID` and upstream mechanics), dispatch workspace as a separate resource kind, cmux workspace, command-and-source-branch sentence as a plan-dispatch label

**Herdr tab**:
A tab resource inside a Herdr space, addressed by `/ns:herdr:tab:*` commands. Commands that mutate or launch into the caller's tab or space resolve explicit Herdr caller identity before doing dependent work.
*Avoid*: surface, pane, workflow family, implicit focused tab

**New space**:
The focused Herdr space created by `/ns:herdr:space:new` at the Pi command's current working directory. An optional natural-language description is interpreted by the configured slug model into a flat semantic label and receives the compact Slot prefix when the current directory is a managed Slot.
*Avoid*: dispatch space, slot checkout, raw workspace-create wrapper, deterministic label fallback

**New tab**:
The focused Herdr tab created by `/ns:herdr:tab:new` in the caller space at the Pi command's current working directory. An optional natural-language description is interpreted by the configured slug model into an unprefixed semantic label.
*Avoid*: new space, implicit focused space, raw tab-create wrapper

**Space goal**:
The `/ns:herdr:space:goal` operation that interprets a goal and renames the explicit caller space with the shared goal-label policy.
*Avoid*: objective summary, metadata report, tab goal

**Tab goal**:
The `/ns:herdr:tab:goal` operation that interprets a goal and renames the explicit caller tab with the shared goal-label policy.
*Avoid*: space goal, UI-focus targeting, workspace rename

**Herdr Handoff tab**:
The optional `/ns:herdr:tab:handoff` integration with `@nseng-ai/handoffs`. The Handoff Pi create flow owns Handoff Artifact composition, content-derived slugging, and persistence; `@nseng-ai/pi-ns-herdr` transports the caller's launch profile (provider, model, thinking). The hidden reference-based `ns herdr exec handoff-tab launch` command verifies the stored artifact by branch and slug, constructs the canonical Pi launch through the shared extension-kit `pi-launch` helper with the durable pickup reference, and only then creates a focused tab labeled `handoff:<handoff-slug>` and launches pickup in its root pane. Registration is conditional on the curated Handoffs Pi integration being available.
*Avoid*: generic Herdr handoff workflow family, model-facing launch tool, arbitrary command transport, Markdown transport through Herdr, Handoffs-owned destination, compatibility alias

**Caller space targeting**:
Identifying the explicit caller Herdr space through `HERDR_WORKSPACE_ID`, injected by Herdr into a managed pane. Space rename and tab-creation/launch flows validate and capture this ID before dependent work or destination mutation.
*Avoid*: UI focus targeting, ambient space, implicit space

**Caller tab targeting**:
Identifying the exact Herdr tab to rename through `HERDR_TAB_ID`, injected by Herdr into a managed pane. Tab rename flows validate this ID before model work or mutation and never substitute `HERDR_WORKSPACE_ID` or UI focus.
*Avoid*: caller space ID, focused tab, current tab inference

**Herdr resource label**:
An ns-authored display label for a Herdr space or tab. Space labels use `s<number>:<label>` when the resource cwd is a managed ns Slot and `<label>` otherwise; tab labels always use `<label>` without a Slot prefix. Goal labels use `<goal-slug>`, Objective space labels use `obj:<objective-slug>`, implementation labels use the collision-resolved branch name, and Handoff tab labels use `handoff:<handoff-slug>`. Unlabeled resource creation remains unlabeled.
*Avoid*: Slot-prefixed tab label, semantic slug as implementation label, unconditional slot prefix

**Objective space summary**:
The `/ns:herdr:space:objective-summary` workflow that resolves an Objective slug and labels the explicit caller space `s<number>:obj:<objective-slug>` in a managed ns slot and `obj:<objective-slug>` otherwise.
*Avoid*: sidebar workflow family, workspace metadata report, generic workspace summary

**Label-only behavior**:
The current `/ns:herdr:space:objective-summary` implementation applies only a space label. Branch metadata reporting remains deferred.
*Avoid*: metadata transport, inferred slot from arbitrary basename, partial cmux parity

**Contextual implementation branch basis**:
The invocation-time policy shared by prompt-to-space, prompt-to-tab, plan-to-space, and plan-to-tab implementation. Named `main` or `master` selects Local trunk automatically; another named branch offers Current branch (`<name>`) or Local trunk; detached HEAD or current-branch lookup failure offers confirmed Local-trunk fallback. Herdr never fetches or refreshes trunk: the local trunk branch name comes from the repository's cached `refs/remotes/origin/HEAD`, read only after Local trunk is selected and never at extension registration or through Graphite. A failed lookup, missing interaction UI, or cancellation stops before downstream mutation. Tab-targeted prompt and plan workflows validate and capture caller space identity immediately after acknowledgement, before idle waiting, Git inspection, interaction, or mutation.
*Avoid*: command-name branch basis, `--from` override, refreshed trunk, implicit fetch, startup trunk resolution, Graphite trunk query, silent noninteractive default, duplicated prompt/plan selection policy

**Herdr implementation workflow**:
A Herdr `impl` workflow that implements a prompt or Saved Plan using the existing agent instructions and workflow behavior. Prompt and Saved Plan commands are symmetric across new-space and new-tab destinations; tab destinations are created and focused in the explicit caller space. `impl` describes the outcome, while destination and process launch remain supporting mechanics.
*Avoid*: remote dispatch, new agent-behavior contract, process startup as the workflow outcome, session cloning, Handoff Artifact transport for ordinary implementation

**Session implementation preparation**:
The Pi-native `/ns:herdr:impl:session:{space,tab}` preparation workflows ask the active session for a directed, self-contained implementation prompt as a visible model turn, then prefill the matching `/ns:herdr:impl:prompt:{space,tab}` command in the editor for review. They share one pending-summary coordinator and never auto-submit the command or mutate Herdr, Git, Handoff, or Branch Memory state.
*Avoid*: nested hidden model call, serialized session replay, automatic prompt submission, concurrent destination-specific summary coordinators

**Herdr command catalog**:
The twelve-entry Pi catalog has eleven base registrations and the optional `/ns:herdr:tab:handoff` registration. It contains six space operations (`space:{new,goal,objective-summary}` and `impl:{prompt,session,plan}:space`), five base tab operations (`tab:{new,goal}` and `impl:{prompt,session,plan}:tab`), plus the optional Handoff tab workflow; the former `launch` names and earlier five `br`/`tr` names have no visible or hidden compatibility aliases.
*Avoid*: workflow-family catalog, compound dispatch action names, branch-basis command segment, `/ns:herdr:handoff:*`, `/ns:herdr:objective:*`, `tab:plan-dispatch`, implementation commands under `/ns:herdr:launch:*`

**Launch mechanics boundary**:
Launch remains correct vocabulary for supporting mechanics: **Prepared Herdr Launch** owns destination creation and process startup, Pi launch mechanics start the Pi process, `ns-impl` identifies prompt transport/storage for implementation workflows in Branch Memory, and Handoff launch starts pickup after a durable Handoff Artifact is verified. These are distinct from the user-facing implementation workflow.
*Avoid*: banning launch vocabulary globally, `ns-impl` as command name, Handoff launch for ordinary prompt or plan implementation

**Herdr extension boundary**:
The thin `api` subpackage exposes command metadata and focused Herdr domain operations to host adapters. The `ns` subpackage composes hidden reference-based commands, canonical Pi launch construction through the shared extension-kit helper, and real same-channel gateways; core stays host-independent. Pi registration, interaction, presentation, launch-profile resolution, and optional Handoffs host composition live in `@nseng-ai/pi-ns-herdr`.
*Avoid*: Pi imports in Herdr core, host-owned Herdr domain, package cycle, compatibility Pi export
