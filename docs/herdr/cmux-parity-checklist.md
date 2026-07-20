# Herdr Migration History and Current Command Catalog

This document records the completed migration from the former cmux capability to Herdr and gives one exact inventory of the current Herdr Pi surface. It is migration history, not a cmux operating guide: the cmux package, extension adapter, CLI commands, and `/ns:cmux:*` commands have been removed.

## Migration disposition

The former cmux workflows were evaluated by behavior rather than copied as a namespace. Herdr retained the useful destination operations—creating spaces, creating tabs, dispatching prompts or Saved Plans, and applying semantic labels—then organized them around Herdr resources.

Not carried forward:

- model-assisted session and branch-state sidebar summaries;
- the Claude plan-tab command;
- the generic cmux workspace-summary CLI;
- standalone open-branch commands;
- cmux metadata, status-pill, and raw workspace/surface operations;
- interim Herdr workflow-family names under `/ns:herdr:handoff:*` or `/ns:herdr:objective:*`.

The only Handoff-specific Herdr workflow is the real Handoff Artifact integration at `/ns:herdr:tab:handoff`. Ordinary prompt and plan dispatches are not handoffs.

## Current Herdr Pi catalog

The catalog contains exactly eleven commands. The first ten are base registrations; `/ns:herdr:tab:handoff` is registered only when the curated Handoffs Pi integration is available.

### Space resources

| Command                                           | Behavior                                                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `/ns:herdr:space:new [description]`               | Create and focus a space at the current cwd, optionally with a model-derived semantic label.                                |
| `/ns:herdr:space:goal <goal>`                     | Derive a goal label and rename the explicit caller space.                                                                   |
| `/ns:herdr:space:objective-summary [objective]`   | Resolve an Objective and apply its label to the explicit caller space.                                                      |
| `/ns:herdr:space:dispatch-prompt <prompt>`        | Prepare a tracked branch and slot, create a space, and launch the prompt in Pi.                                             |
| `/ns:herdr:space:dispatch-trunk-prompt <prompt>`  | Refresh trunk, prepare the dispatch branch and slot, create a space, and launch the prompt in Pi.                           |
| `/ns:herdr:space:dispatch-plan [--dry-run]`       | Select a Saved Plan, prepare its Branch Context and slot, create a space, and launch Attached Plan implementation.          |
| `/ns:herdr:space:dispatch-trunk-plan [--dry-run]` | Select a Saved Plan and prepare it from refreshed trunk before creating a space and launching Attached Plan implementation. |

### Tab resources

| Command                                   | Behavior                                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/ns:herdr:tab:new [description]`         | Create and focus a tab in the explicit caller space at the current cwd, optionally with a model-derived label.                              |
| `/ns:herdr:tab:goal <goal>`               | Derive a goal label and rename the exact caller tab identified by `HERDR_TAB_ID`.                                                           |
| `/ns:herdr:tab:dispatch-plan [--dry-run]` | Select and prepare a Saved Plan, create a focused tab in the explicit caller space, and launch Attached Plan implementation.                |
| `/ns:herdr:tab:handoff`                   | Create a durable Handoff Artifact, then create a focused tab in the explicit caller space and launch pickup. Optional Handoffs integration. |

## Targeting and boundaries

- `HERDR_WORKSPACE_ID` identifies the caller space for space rename, tab creation, tab plan dispatch, and Handoff tab launch. Commands fail rather than target UI focus when it is absent.
- `HERDR_TAB_ID` identifies the exact caller tab for `/ns:herdr:tab:goal`. It is not interchangeable with the workspace ID.
- Herdr owns destination creation, labels, and pane launch. Plans, Branch Context, Slots, Graphite preparation, and Handoff Artifact lifecycle remain owned by their respective capabilities.
- Hidden `ns herdr exec handoff-tab launch` is a reference-based implementation command, not a public generic launcher or an additional Pi command.

## Parked Herdr work

Event subscriptions, agent waits, declarative layouts, plugins, raw socket integration, generated protocol types, and a public generic workspace-summary command remain parked until a concrete consumer requires them.
