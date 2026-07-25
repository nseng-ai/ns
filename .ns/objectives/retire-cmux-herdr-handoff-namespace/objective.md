# Retire cmux and Establish Herdr Implementation Workflows

## Thesis

The dedicated cmux capability is redundant with Herdr and has been removed. Herdr's public Pi catalog now separates direct `space` and `tab` resource operations from three `impl` workflows whose outcome is a responsible implementation attempt, not process startup alone.

An implementation attempt inspects the supplied prompt or Saved Plan and the repository, implements the request when it is valid, and otherwise stops with a concrete blocker or clarification request. Prepared Herdr Launch, destination startup, Pi launch mechanics, and `ns-launch` prompt transport/storage remain supporting mechanics. Handoff launch remains valid for the distinct durable Handoff Artifact workflow.

The reviewed implementation plan is saved in the local plan store at:

`$XDG_STATE_HOME/ns/enriched-plan/gh--nseng-ai--ns/master/resource-first-herdr-command-catalog.md`

The earlier migration plan remains committed as historical planning evidence at `references/retire-cmux-herdr-handoff-commands.md`.

## Scope

- Register exactly these public Pi commands, with no compatibility aliases:
  - `/ns:herdr:space:{new,goal,objective-summary}`
  - `/ns:herdr:tab:{new,goal,handoff}`
  - `/ns:herdr:impl:prompt:space`, `/ns:herdr:impl:plan:space`, and `/ns:herdr:impl:plan:tab`.
- Give all three `impl` workflows responsible-attempt semantics: inspect input and repository, implement a valid request, otherwise stop with a concrete blocker or clarification.
- Select current branch or existing local trunk at invocation time through one policy: `main`/`master` select local trunk automatically; other named branches offer current branch or local trunk; detached HEAD and lookup failure offer confirmed local-trunk fallback; required interaction without UI fails before mutation.
- Never fetch or refresh trunk in Herdr implementation workflows.
- Preserve caller workspace preflight before Git inspection or interaction for plan-to-tab and preserve non-mutating plan dry runs.
- Preserve label-only Objective summary behavior and hidden `ns herdr exec handoff-tab launch` Handoff launch mechanics.
- Preserve Prepared Herdr Launch for Slot checkout, destination creation/labeling, pane process startup, status, notifications, and structured evidence.
- Keep cmux and standalone Herdr open-branch implementation removed.
- Reconcile current domain and user documentation while preserving historical ADRs, research, retrospectives, reshape specifications, and immutable Semantic Updates.
- Keep gated `docs-site/` content unchanged and retain its stale catalog entry as a follow-up.

## Non-Goals

- Adding a tab prompt-implementation variant.
- Adding `--from`, branch-basis command segments, or compatibility aliases for any former `launch`, `br`/`tr`, workflow-family, or cmux command.
- Renaming Prepared Herdr Launch, Pi launch mechanics, the `ns-launch` transport/storage namespace, or Handoff launch where those terms accurately describe startup or transport.
- Changing prompt payloads, latest-session Saved Plan selection, Attached Plan implementation semantics, or destination behavior.
- Expanding Objective summary beyond label-only behavior.
- Introducing a generic terminal-multiplexer abstraction, generic Herdr workspace-summary CLI, raw socket integration, event subscriptions, layouts, or plugins.
- Rewriting historical records or gated `docs-site/` content.

## Completion Criteria

- The exact nine-command catalog is registered: eight base commands plus optional `/ns:herdr:tab:handoff`; the implementation commands are exactly `/ns:herdr:impl:prompt:space`, `/ns:herdr:impl:plan:space`, and `/ns:herdr:impl:plan:tab`.
- Former `/ns:herdr:launch:*`, branch-basis-specific `br`/`tr`, interim workflow-family, cmux, and open-branch commands have no visible or hidden aliases.
- Prompt implementation carries explicit responsible-attempt guidance; plan implementation launches the Attached Plan implementation workflow under the same semantic boundary.
- All three implementations share contextual branch-basis selection, and cancellation or unavailable interaction mutates nothing.
- Named `main`/`master` use the exact existing local Graphite trunk without fetching or refreshing it.
- Plan-to-tab validates and captures `HERDR_WORKSPACE_ID` before Git inspection or interaction; plan dry-run remains non-mutating.
- Direct tab operations retain exact caller targeting, semantic labeling, and no UI-focus fallback.
- Current contexts and user docs state the exact catalog and distinguish implementation semantics from retained launch mechanics.
- Relevant focused tests, TypeScript checks, formatting checks, diff checks, and Objective structural checks have recorded evidence. The known immutable legacy-update checker incompatibility remains reported rather than worked around.

## Assumptions and Risks

**Assumptions**

- Herdr-managed panes inject `HERDR_WORKSPACE_ID` and `HERDR_TAB_ID`.
- Branch Context remains the owner of deterministic collision selection and race revalidation.
- The Attached Plan implementation command supplies responsible implementation behavior for plan workflows; prompt workflows carry equivalent explicit guidance in their stored payload.

**Risks**

- Treating successful process startup as successful implementation would weaken the intended contract.
- Renaming internal Prepared Herdr Launch or `ns-launch` merely because public commands changed would conflate workflow semantics with transport and startup mechanics.
- Copying local-trunk or Branch Context policy into Herdr would create divergent behavior.
- Broad terminology edits could corrupt valid historical evidence or leave stale current catalog text.
- The immutable legacy update `20260719T181812Z-reference-based-herdr-handoff-launch.md` remains structurally incompatible with the current Objective checker; it must not be rewritten.

## Open Questions

No product-contract questions remain open. Objective closure remains blocked by the immutable legacy Semantic Update `20260719T181812Z-reference-based-herdr-handoff-launch.md`, which lacks headings required by the current checker. Historical updates must not be edited, so no `closed.md` is added pending an authorized compatibility mechanism.
