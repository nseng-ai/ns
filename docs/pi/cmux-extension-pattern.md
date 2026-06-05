# cmux Extension Pattern for Pi

This guide captures the repo-local pattern for Pi commands that open cmux workspaces or update cmux sidebar/workspace-card metadata. It is based on the project-local cmux command suite and installed cmux CLI behavior verified during that work.

## Use this pattern when

- A Pi command labels or annotates the caller cmux workspace from Pi session context.
- A Pi command opens a new cmux workspace without automatically refreshing sidebar metadata.
- A manual sidebar update must target the workspace that launched this terminal, not whatever cmux workspace is focused now.
- The behavior is repo-local to `asdl-tools` and should not become a global Pi extension.
- The workflow needs a short semantic model pass but deterministic cmux mutation.

## Layering

Current layers:

| Layer                  | Path / command                               | Responsibility                                                                             |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Pi discovery adapter   | `.pi/extensions/cmux.ts`                     | Thin adapter that registers the repo cmux command suite                                    |
| Engineered TS package  | `ts/packages/pi-extensions/src/cmux.ts`      | Wires shared cmux controllers and command modules                                          |
| cmux command modules   | `ts/packages/pi-extensions/src/cmux/`        | Implements `/cmux:*`, `/cmux-slot:*`, and `/cmux-slot:dispatch-prompt` behavior with tests |
| Local sidebar skill    | `skills/cmux-sidebar/SKILL.md`               | Tells the model what sidebar fields to generate                                            |
| Deterministic CLI      | `asdl exec cmux-workspace-summary`           | Applies title and direct description, then clears the legacy `pi-summary` cmux status pill |
| cmux gateway           | `src/asdl_tools/cmux/gateway.py`             | Runs installed cmux CLI commands                                                           |
| Scenario/package tests | `tests/scenario/test_cli.py`, `ts/.../test/` | Cover Python exec behavior and Pi command behavior                                         |

Project-local `.pi/extensions/*.ts` files should stay thin once behavior is durable or risky. Put reusable cmux command behavior under `ts/packages/pi-extensions/src/cmux/` with Bun tests.

Do not put raw cmux mutation sequences in long skill bodies when a tested `asdl exec` command can own them.

## Command suite

The project-local adapter registers:

- `/cmux:pr-sidebar`
- `/cmux:objective-sidebar [objective-slug-or-path]`
- `/cmux-slot:dispatch-plan`
- `/cmux-slot:open-branch`
- `/cmux-slot:dispatch-prompt`

There is no legacy `/cmux:set-workspace-summary` alias.

`/cmux-refresh-meta` was intentionally removed and not replaced. It only refreshed the current workspace name/description and did not open a new workspace; future metadata refresh behavior should be designed around `asdl exec cmux-workspace-summary`, not raw cmux mutations.

## Duplicate command troubleshooting

If `/reload` shows duplicate cmux commands with numeric suffixes, the canonical project source should still be `.pi/extensions/cmux.ts` plus `ts/packages/pi-extensions/src/cmux/`. Check only the known user-local extension directory for stale migrated files:

```bash
find /Users/schrockn/.pi/agent/extensions -maxdepth 2 \
  \( -name 'cmux*.ts' -o -path '*/shared/branch-slug.ts' \) -print | sort
```

Remove stale user-local cmux files only after confirming the project adapter registers the command suite. Do not run a broad home-directory search for duplicate Pi resources.

## Automatic sidebar updates are disabled

Workspace-opening commands currently do not auto-run sidebar updates after success:

- `/cmux-slot:dispatch-plan`
- `/cmux-slot:open-branch`
- `/cmux-slot:dispatch-prompt`

The previous automatic flow targeted the workspace running the command via `CMUX_WORKSPACE_ID` or `CMUX_TAB_ID`, not the newly opened workspace. New-workspace targeting should be designed during the future cmux extension consolidation pass rather than inferred from `cmux workspace list` in this slice.

The new workspace still receives initial `cmux new-workspace --name ... --description ... --cwd ...` fields from the launching command. Commands that launch a child Pi session must pass the caller's current `--provider`, `--model`, and non-off `--thinking` explicitly instead of relying on Pi's mutable default model settings.

## Caller workspace contract

Manual sidebar commands resolve the caller workspace from process environment only:

```typescript
process.env.CMUX_WORKSPACE_ID ?? process.env.CMUX_TAB_ID
```

If no caller workspace is available, notify and return. Do not fall back to the focused workspace because a background Pi session can be running while another cmux workspace is focused.

The manual sidebar skill does not pass `--workspace`; `asdl exec cmux-workspace-summary` resolves the same caller workspace env itself.

## Model choice and speed

Sidebar updates are low-stakes semantic compression. The controller temporarily switches the follow-up turn to a faster model and minimal thinking:

- env override: `ASDL_CMUX_SIDEBAR_MODEL=provider/model`
- default: `openai-codex/gpt-5.4-mini`
- thinking level: `minimal`

The controller restores the previous model and thinking level on `agent_end`. If the fast model is missing or unavailable, it warns and uses the current model.

## Prompt shape

The model should generate only these fields:

- `title`
- `description`

The description is exactly one short line:

```text
Goal: ...
```

Prompt-only length enforcement is intentional for now. Do not add deterministic validation unless the design changes.

## Variants

`/cmux:pr-sidebar` summarizes current PR, branch, or active implementation work. The Goal line describes the PR outcome, not the cmux update itself.

`/cmux:objective-sidebar [objective-slug-or-path]` summarizes the selected asdl Objective. If no Objective slug or path is supplied, the queued model prompt must ask the user to provide or choose one and must not infer from branch, PR, or hidden context.

## Apply through exec, not raw cmux

The skill should tell the model to call exactly one deterministic command when the source is resolved:

```bash
asdl exec cmux-workspace-summary \
  --title 'Short title' \
  --description 'Goal: ...' \
  --format json
```

Do not assign shell variables, do not write an env prelude, and do not pass `--workspace` from the skill. The command clears the legacy `pi-summary` cmux status pill. The JSON envelope must have `exit_code: 0` and `data.success: true`. The assistant should then reply only with the applied title.

See [`../asdl-exec/cmux-workspace-summary.md`](../asdl-exec/cmux-workspace-summary.md) for the exec contract and [`../cmux/help-querying.md`](../cmux/help-querying.md) for how to revalidate cmux CLI behavior.

## Opening new cmux workspaces

Before changing raw `cmux new-workspace` arguments, revalidate the installed CLI help:

```bash
cmux new-workspace --help
```

The currently expected shape is:

```bash
cmux new-workspace \
  --name '<branch-or-title>' \
  --description '<repo>/<branch>' \
  --cwd '<worktree>' \
  --command '<optional launch command>'
```

Do not rely on stale local cmux source checkouts for behavior.

## Avoid stale cmux source

Do not inspect or rely on `/Users/schrockn/code/githubs/manaflow-ai/cmux` for behavior unless that checkout has been updated and revalidated. Use installed `cmux --help` surfaces instead.

## Context pollution

The manual sidebar implementation injects a normal follow-up user message with the expanded skill block. That means the control prompt, assistant response, and tool result can appear in future model context. Filtering those traces is intentionally not implemented in this pass.

If future sidebar updates start describing earlier sidebar refreshes, design a context-filtering extension hook or move the whole flow into direct extension code.

## Future “agent writes no bash” target

If the next iteration should require no model-authored shell at all, make the extension own the summary-and-apply loop:

1. Use Pi model APIs or an existing fast-draft helper to generate a small JSON object for the fields.
2. Validate and shorten fields in TypeScript.
3. Call `pi.exec("asdl", ["exec", "cmux-workspace-summary", ...])` with argv.
4. Display the resulting title directly.

That design keeps semantic summarization in a model while making quoting, cmux targeting, and command execution fully deterministic. It also removes the skill-driven bash block from the conversation. Reintroducing automatic summaries should wait until that targeting and apply path are explicit.

## Validation checklist

After changing cmux-related Pi resources:

```bash
just ts-check
just ts-test
uv run pytest tests/scenario/test_cli.py -k cmux_workspace_summary
just dprint-check
```

If Python gateway or root CLI behavior changed, run the full suite:

```bash
just
```

Then reload Pi:

```text
/reload
```

Finally smoke-test from inside cmux:

```text
/cmux:pr-sidebar
/cmux:objective-sidebar <objective-slug>
/cmux-slot:dispatch-plan --dry-run
/cmux-slot:open-branch <branch>
```
