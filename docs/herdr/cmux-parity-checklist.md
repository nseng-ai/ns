# Herdr Capability Parity Checklist

This checklist reconciles every current `@nseng-ai/cmux` user-visible command,
programmatic surface, and underlying workspace operation to its settled Herdr
applicability disposition. Dispositions are fixed; see `objective.md` for the
full selection rationale.

## Key

| Symbol                                                                 | Meaning |
| ---------------------------------------------------------------------- | ------- |
| ✅ Selected — implement in `@nseng-ai/herdr`                           |         |
| ❌ Retired — removed; not carried forward                              |         |
| 🚫 Not applicable — no matching Herdr semantic                         |         |
| 📌 Parked — applicable but deferred (listed in roadmap Parked section) |         |

---

## Pi extension commands (`/ns:cmux:*`)

### Dispatch and branch-opening workflows

| cmux surface                             | Disposition | Herdr mirror                              | Notes                                                                                                                               |
| ---------------------------------------- | ----------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `/ns:cmux:workspace:dispatch-prompt`     | ✅ Selected | `/ns:herdr:workspace:dispatch-prompt`     | Both consume Capability Kit's shared tracked-branch preparation and `ns-dispatch/prompt.md`; each vendor owns final workspace open. |
| `/ns:cmux:workspace:dispatch-from-trunk` | ✅ Selected | `/ns:herdr:workspace:dispatch-from-trunk` | Both consume shared Graphite trunk refresh/tracked-branch preparation; each vendor owns final workspace open.                       |
| `/ns:cmux:workspace:dispatch-plan`       | ✅ Selected | `/ns:herdr:workspace:dispatch-plan`       | Opens Attached Plan checkout in a new Herdr workspace; ns owns branch-context and slot, Herdr owns workspace launch.                |
| `/ns:cmux:surface:dispatch-plan`         | ✅ Selected | `/ns:herdr:surface:dispatch-plan`         | Opens a tab in the captured caller Herdr workspace; `HERDR_WORKSPACE_ID` is required before plan lookup or mutation.                |
| `/ns:cmux:workspace:open-branch`         | ✅ Selected | `/ns:herdr:workspace:open-branch`         | Preserves explicit and inferred branch selection, confirmation, completions, and ns slot checkout.                                  |

### Sidebar / metadata commands

| cmux surface                            | Disposition | Herdr mirror                          | Notes                                                                                                                                                                                                      |
| --------------------------------------- | ----------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/ns:cmux:sidebar:objective-summary`    | ✅ Selected | `/ns:herdr:sidebar:objective-summary` | Labels the explicit caller Herdr workspace `s<number>:obj:<slug>` in a managed ns slot and `obj:<slug>` otherwise. Metadata fields are not reported; no public generic workspace-summary command is added. |
| `/ns:cmux:sidebar:session-summary`      | ❌ Retired  | —                                     | Removed; model-assisted session summarization via skill injection is not carried to Herdr. The `ns-cmux-sidebar` managed skill is retired with it.                                                         |
| `/ns:cmux:sidebar:branch-state-summary` | ❌ Retired  | —                                     | Removed; model-assisted branch-state sidebar is not carried to Herdr. The `ns-cmux-sidebar` managed skill is retired with it.                                                                              |
| `/ns:cmux:claude-plan-tab`              | ❌ Retired  | —                                     | Removed; opens a focused Claude Code plan-mode tab. Not a Herdr workflow; no matching Herdr operation is selected.                                                                                         |

---

## ns CLI commands (`ns cmux exec *`)

| cmux surface                     | Disposition         | Notes                                                                                                                                                                                                            |
| -------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ns cmux exec workspace-summary` | ✅ Retained in cmux | Used by the retained `/ns:cmux:sidebar:objective-summary` deterministic flow. Not mirrored in Herdr as a public command; `/ns:herdr:sidebar:objective-summary` only labels/renames the caller workspace for now. |

---

## Programmatic surfaces and underlying workspace operations

| Operation                                        | cmux mechanism                                                 | Herdr applicability | Notes                                                                                                                                                                  |
| ------------------------------------------------ | -------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open new workspace                               | `cmux new-workspace --cwd --command`                           | ✅ Selected         | Herdr CLI equivalent used for dispatch and open-branch workflows. Caller ID from `HERDR_WORKSPACE_ID` or equivalent env; no focus-dependent targeting.                 |
| Open focused tab (surface) in existing workspace | `cmux new-surface --type terminal --workspace --pane --window` | ✅ Selected         | Used for `/ns:herdr:surface:dispatch-plan`; explicit caller workspace ID from `HERDR_WORKSPACE_ID` env; tab created with `--focus` to activate immediately.            |
| Rename tab                                       | `cmux rename-tab --workspace --surface --title --window`       | ✅ Selected         | Used for focused-tab naming in surface dispatch plan.                                                                                                                  |
| Send command to pane                             | `cmux send --workspace --surface --window -- <cmd>`            | ✅ Selected         | Used for command injection in surface dispatch plan.                                                                                                                   |
| Identify caller workspace/tab                    | `cmux identify --json`                                         | ✅ Selected         | Herdr equivalent used to resolve caller IDs; CLI-first, no raw socket.                                                                                                 |
| Apply workspace metadata (title + description)   | `ns cmux exec workspace-summary --title --description`         | 🚫 Not applicable   | Installed Herdr CLI lacks a metadata-update operation; `/ns:herdr:sidebar:objective-summary` labels/renames the caller workspace only. No metadata fields are applied. |
| Caller workspace ID from env                     | `CMUX_WORKSPACE_ID` / `CMUX_TAB_ID`                            | ✅ Selected         | Herdr provides equivalent caller-ID env variables; exact names resolved from installed Herdr CLI and research.                                                         |

---

## Managed skills

| Skill             | Disposition | Notes                                                                                                                                                                                                                             |
| ----------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ns-cmux-sidebar` | ❌ Retired  | Backed `/ns:cmux:sidebar:session-summary` and `/ns:cmux:sidebar:branch-state-summary`; retired with those commands. No Herdr equivalent is added because the model-assisted session/branch-state sidebar pattern is not selected. |

---

## Non-selected applicable work (visible follow-up)

The following items were evaluated and found applicable to Herdr semantics but
are explicitly deferred rather than silently omitted:

- **Herdr-native event subscriptions and agent waits** — Herdr has documented
  event subscription APIs; integration is parked until a concrete use case
  requires behavior that CLI polling cannot satisfy.
- **Declarative layouts and plugin hooks** — Herdr supports layouts and plugins;
  deferred until a second concrete Herdr consumer identifies the need.
- **Raw socket event integration and generated protocol types** — parked until
  a selected workflow demonstrates CLI wrappers are insufficient.
- **Public generic `ns herdr exec workspace-summary` command** — parked pending
  a second concrete Herdr consumer that would justify the public surface.

---

## Retained cmux surfaces (not retired, not mirrored)

The following cmux surfaces are retained as-is and are not part of the Herdr
parity scope:

- `/ns:cmux:sidebar:objective-summary` — retained in cmux; mirrored in Herdr.
- `ns cmux exec workspace-summary` — retained in cmux; used by the cmux
  objective-summary deterministic flow.
- All other `/ns:cmux:workspace:*` and `/ns:cmux:surface:*` dispatch and
  open-branch commands — retained in cmux; mirrored in Herdr (PR 3).
