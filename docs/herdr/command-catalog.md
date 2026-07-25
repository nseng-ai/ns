# Herdr Command Catalog and Migration History

This document is the exact current inventory of the Herdr Pi surface. It also records the completed migration from the former cmux capability: the cmux package, extension adapter, CLI commands, and `/ns:cmux:*` commands have been removed. The historical filename `cmux-parity-checklist.md` was retired once this document became predominantly a current command catalog.

## Current Herdr Pi catalog

The catalog contains exactly nine commands. The first eight are base registrations; `/ns:herdr:tab:handoff` is registered only when the curated Handoffs Pi integration is available.

### Space resources and implementation workflows

| Command                                         | Behavior                                                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `/ns:herdr:space:new [description]`             | Create and focus a space at the current cwd, optionally with a model-derived semantic label.                          |
| `/ns:herdr:space:goal <goal>`                   | Derive a goal label and rename the explicit caller space.                                                             |
| `/ns:herdr:space:objective-summary [objective]` | Resolve an Objective and apply its label to the explicit caller space.                                                |
| `/ns:herdr:impl:prompt:space <prompt>`          | Select current branch or local trunk contextually, then start a responsible implementation attempt in a new space.    |
| `/ns:herdr:impl:plan:space [--dry-run]`         | Select current branch or local trunk contextually, then start implementation of the latest Saved Plan in a new space. |

### Tab resources and implementation workflows

| Command                               | Behavior                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/ns:herdr:tab:new [description]`     | Create and focus a tab in the explicit caller space at the current cwd, optionally with a model-derived label.                              |
| `/ns:herdr:tab:goal <goal>`           | Derive a goal label and rename the exact caller tab identified by `HERDR_TAB_ID`.                                                           |
| `/ns:herdr:impl:plan:tab [--dry-run]` | Select current branch or local trunk contextually, then start implementation of the latest Saved Plan in a new tab.                         |
| `/ns:herdr:tab:handoff`               | Create a durable Handoff Artifact, then create a focused tab in the explicit caller space and launch pickup. Optional Handoffs integration. |

An **implementation workflow** is a responsible implementation attempt, not merely process startup. The launched agent inspects the supplied prompt or plan and the repository, implements the request when it is valid, and otherwise stops with a concrete blocker or clarification request.

The implementation branch-basis policy is uniform: named `main` or `master` automatically uses the existing local Graphite trunk; another named branch offers **Current branch (`<name>`)** or **Local trunk**; detached HEAD and current-branch lookup failure offer confirmed local-trunk fallback. Herdr never fetches or refreshes trunk; users update local trunk separately when desired. Cancellation, declined fallback, missing interaction UI, and local-trunk resolution failure all stop before downstream mutation. Plan-to-tab captures `HERDR_WORKSPACE_ID` before Git inspection or interaction. Plan dry runs perform contextual selection and read the existing local trunk SHA without mutation.

This semantic shift was a clean breaking cutover. The former `/ns:herdr:launch:prompt:space`, `/ns:herdr:launch:plan:space`, and `/ns:herdr:launch:plan:tab` names have no visible or hidden aliases. The earlier five branch-basis-specific `br`/`tr` launch names also remain removed without aliases.

## Launch vocabulary that remains valid

The command cutover does not remove launch as a process or destination concept:

- **Prepared Herdr Launch** remains the internal destination-startup operation after a branch and implementation command have been prepared.
- Herdr still owns workspace/tab creation and process startup in the selected pane; Pi launch mechanics still construct and start the Pi process.
- The `ns-launch` Branch Memory namespace remains the transport/storage locator for prompt payloads. It does not name the user-facing workflow.
- **Handoff launch** remains correct for `/ns:herdr:tab:handoff`, which creates and verifies a durable Handoff Artifact before launching pickup.

## Targeting and boundaries

- `HERDR_WORKSPACE_ID` identifies the caller space for space rename, tab creation, tab plan implementation, and Handoff tab launch. Commands fail rather than target UI focus when it is absent.
- `HERDR_TAB_ID` identifies the exact caller tab for `/ns:herdr:tab:goal`. It is not interchangeable with the workspace ID.
- Herdr owns destination creation, labels, and pane process startup. Prepared Herdr Launch labels use the model-derived semantic slug rather than a collision-resolved Git branch name: spaces may add the compact slot prefix derived from the actual checked-out worktree path, while tabs use the exact semantic slug. Plans, Branch Context, Slots, Graphite preparation, and Handoff Artifact lifecycle remain owned by their respective capabilities.
- Hidden `ns herdr exec handoff-tab launch` is a reference-based implementation command for Handoff launch, not a public generic launcher or an additional Pi command.

## Migration disposition

The former cmux workflows were evaluated by behavior rather than copied as a namespace. Herdr retained useful destination operations—creating spaces and tabs, starting prompt or Saved Plan implementation, and applying semantic labels—then organized them around Herdr resources.

Not carried forward:

- model-assisted session and branch-state sidebar summaries;
- the Claude plan-tab command;
- the generic cmux workspace-summary CLI;
- standalone open-branch commands;
- cmux metadata, status-pill, and raw workspace/surface operations;
- interim Herdr workflow-family names under `/ns:herdr:handoff:*` or `/ns:herdr:objective:*`.

The only Handoff-specific Herdr workflow is the real Handoff Artifact integration at `/ns:herdr:tab:handoff`. Ordinary prompt and plan implementation workflows are not handoffs.

## Parked Herdr work

Event subscriptions, agent waits, declarative layouts, plugins, raw socket integration, generated protocol types, and a public generic workspace-summary command remain parked until a concrete consumer requires them.
