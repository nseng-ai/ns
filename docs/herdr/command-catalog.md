# Herdr Command Catalog and Migration History

This document is the exact current inventory of the Herdr Pi surface. It also records the completed migration from the former cmux extension: the cmux package, extension adapter, CLI commands, and `/ns:cmux:*` commands have been removed. The historical filename `cmux-parity-checklist.md` was retired once this document became predominantly a current command catalog.

## Current Herdr Pi catalog

The catalog contains exactly twelve entries. Eleven commands are base registrations; `/ns:herdr:tab:handoff` is registered only when the curated Handoffs Pi integration is available.

### Space resources and implementation workflows

| Command                                         | Behavior                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `/ns:herdr:space:new [description]`             | Create and focus a space at the current cwd, optionally with a model-derived semantic label.                             |
| `/ns:herdr:space:goal <goal>`                   | Derive a goal label and rename the explicit caller space.                                                                |
| `/ns:herdr:space:objective-summary [objective]` | Resolve an Objective and apply its label to the explicit caller space.                                                   |
| `/ns:herdr:impl:prompt:space <prompt>`          | Select current branch or Local trunk contextually, then implement the prompt in a new space.                             |
| `/ns:herdr:impl:session:space [focus]`          | Ask the active session for an implementation-prompt summary and prefill the matching prompt-to-space command for review. |
| `/ns:herdr:impl:plan:space [--dry-run]`         | Select current branch or Local trunk contextually, then start implementation of the latest Saved Plan in a new space.    |

### Tab resources and implementation workflows

| Command                               | Behavior                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/ns:herdr:tab:new [description]`     | Create and focus a tab in the explicit caller space at the current cwd, optionally with a model-derived label.                              |
| `/ns:herdr:tab:goal <goal>`           | Derive a goal label and rename the exact caller tab identified by `HERDR_TAB_ID`.                                                           |
| `/ns:herdr:impl:prompt:tab <prompt>`  | Capture the explicit caller space, select current branch or Local trunk contextually, then implement the prompt in a new focused tab.       |
| `/ns:herdr:impl:session:tab [focus]`  | Ask the active session for an implementation-prompt summary and prefill the matching prompt-to-tab command for review.                      |
| `/ns:herdr:impl:plan:tab [--dry-run]` | Capture the explicit caller space, select current branch or Local trunk contextually, then implement the latest Saved Plan in a new tab.    |
| `/ns:herdr:tab:handoff`               | Create a durable Handoff Artifact, then create a focused tab in the explicit caller space and launch pickup. Optional Handoffs integration. |

An **implementation workflow** implements a prompt or Saved Plan. Prompt, session, and Saved Plan workflows are symmetric across new-space and new-tab destinations. `impl` is shorter, avoids collision with dispatch terminology for remote systems, and describes the outcome more accurately than `launch`. The rename does not change the existing agent instructions or workflow behavior.

The two session commands create a visible model turn that drafts a directed, self-contained implementation prompt, then prefill the matching `/ns:herdr:impl:prompt:{space,tab}` command in the editor. One shared pending-summary coordinator covers both destinations. The commands stop for review: they never auto-submit the prefilled command and never mutate Herdr, Git, Handoff, or Branch Memory state.

The implementation branch-basis policy is uniform: named `main` or `master` automatically uses **Local trunk**; another named branch offers **Current branch (`<name>`)** or **Local trunk**; detached HEAD and current-branch lookup failure offer confirmed Local-trunk fallback. Herdr never fetches or refreshes trunk; users update local trunk separately when desired. The trunk branch name comes from cached `refs/remotes/origin/HEAD`, and the local branch supplies the trunk state; Herdr does not query Graphite for trunk. Cancellation, declined fallback, missing interaction UI, and Local-trunk resolution failure all stop before downstream mutation. Prompt-to-tab and plan-to-tab capture and validate `HERDR_WORKSPACE_ID` immediately after acknowledgement, before idle waiting, Git inspection, interaction, or mutation. Plan dry runs perform contextual selection and read the existing local trunk SHA without mutation.

This semantic shift was a clean breaking cutover. The former `/ns:herdr:launch:prompt:space`, `/ns:herdr:launch:plan:space`, and `/ns:herdr:launch:plan:tab` names have no visible or hidden aliases. The earlier five branch-basis-specific `br`/`tr` launch names also remain removed without aliases.

## Launch vocabulary that remains valid

The command cutover does not remove launch as a process or destination concept:

- **Prepared Herdr Launch** remains the internal destination-startup operation after a branch and implementation command have been prepared.
- Herdr still owns space/tab creation and process startup in the selected pane; Pi launch mechanics still construct and start the Pi process.
- The `ns-impl` Branch Memory namespace identifies prompt payloads for implementation workflows. It is a technical transport/storage locator, not a command name.
- **Handoff launch** remains correct for `/ns:herdr:tab:handoff`, which creates and verifies a durable Handoff Artifact before launching pickup.

## Targeting and boundaries

- `HERDR_WORKSPACE_ID` identifies the caller space for space rename, tab creation, tab prompt or Saved Plan implementation, and Handoff tab launch. Commands fail rather than target UI focus when it is absent. User-facing language says **space**, **tab**, and **caller space**; **workspace** is reserved for this environment variable and upstream mechanics.
- `HERDR_TAB_ID` identifies the exact caller tab for `/ns:herdr:tab:goal`. It is not interchangeable with the workspace ID.
- Herdr owns destination creation, labels, and pane process startup. Every ns-authored space label associated with a managed Slot uses the compact `s<number>:` prefix derived from the resource cwd or actual checked-out worktree path; tab labels never use Slot prefixes. Prepared Herdr Launch labels use the collision-resolved Git branch name so the displayed resource matches the branch it runs. Objective space labels use `[s<number>:]obj:<slug>`, and Handoff tabs use `handoff:<slug>`. Unlabeled resource creation remains unlabeled. Plans, Branch Context, Slots, Graphite preparation, and Handoff Artifact lifecycle remain owned by their respective extensions.
- Hidden `ns herdr exec handoff-tab launch` is a reference-based implementation command for Handoff launch, not a public generic launcher or an additional Pi command.

### Graduation requirement

Before Herdr graduates out of `ts/packages/incubating/` to a public disposition, its dependency on `@nseng-ai/slots` must become conditional. Herdr must remain usable without Slots installed; Slot-aware checkout and compact Slot label behavior should activate only when the Slots integration is available.

## Migration disposition

The former cmux workflows were evaluated by behavior rather than copied as a namespace. Herdr retained useful destination operations—creating spaces and tabs, starting prompt or Saved Plan implementation, and applying semantic labels—then organized them around Herdr resources.

Not carried forward at the cmux-to-Herdr migration cutover:

- branch-state sidebar summaries;
- the former model-assisted session summary workflow (later restored in its current symmetric, editor-prefill form as `/ns:herdr:impl:session:{space,tab}`);
- the Claude plan-tab command;
- the generic cmux workspace-summary CLI;
- standalone open-branch commands;
- cmux metadata, status-pill, and raw workspace/surface operations;
- interim Herdr workflow-family names under `/ns:herdr:handoff:*` or `/ns:herdr:objective:*`.

The only Handoff-specific Herdr workflow is the real Handoff Artifact integration at `/ns:herdr:tab:handoff`. Ordinary prompt and plan implementation workflows are not handoffs.

## Parked Herdr work

Event subscriptions, agent waits, declarative layouts, plugins, raw socket integration, generated protocol types, and a public generic workspace-summary command remain parked until a concrete consumer requires them.
