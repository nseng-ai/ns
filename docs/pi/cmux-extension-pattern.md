# CCC Workspace/Sidebar Pattern for Pi

This guide captures the repo-local pattern for Pi commands that open cmux workspaces or update cmux sidebar/workspace-card metadata. The current project command surface is the CCC workspace/sidebar suite; `cmux` remains the external workspace tool that CCC operates.

## Use this pattern when

- A Pi command labels or annotates the caller cmux workspace from Pi session context.
- A Pi command opens a new cmux workspace without automatically refreshing sidebar metadata.
- A manual sidebar update must target the workspace that launched this terminal, not whatever cmux workspace is focused now.
- The behavior is repo-local to `asdl-tools` and should not become a global Pi extension.
- The PR sidebar workflow needs a short semantic model pass but deterministic cmux mutation.
- The Objective sidebar workflow needs deterministic formatting from an explicit Objective selector or UI picker selection.

## Layering

Current layers:

| Layer                  | Path / command                               | Responsibility                                                         |
| ---------------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| Pi discovery adapter   | `.pi/extensions/ccc.ts`                      | Thin adapter that registers the repo CCC command suite                 |
| Engineered TS package  | `ts/packages/ccc/src/ccc.ts`                 | Wires shared CCC workspace/sidebar controllers and command modules     |
| CCC cmux modules       | `ts/packages/ccc/src/cmux/`                  | Implements `/ccc:workspace:*` and `/ccc:sidebar:*` behavior with tests |
| Local sidebar skill    | `skills/ccc-sidebar/SKILL.md`                | Tells the model what PR sidebar fields to generate                     |
| Deterministic CLI      | `asdl exec cmux-workspace-summary`           | Applies title and direct description, then clears the old status pill  |
| cmux gateway           | `src/asdl_tools/cmux/gateway.py`             | Runs installed cmux CLI commands                                       |
| Scenario/package tests | `tests/scenario/test_cli.py`, `ts/.../test/` | Cover Python exec behavior and Pi command behavior                     |

Project-local `.pi/extensions/*.ts` files should stay thin once behavior is durable or risky. Put reusable CCC workspace/sidebar behavior under `ts/packages/ccc/src/cmux/` with pnpm/Vitest tests. Keep generic Pi lifecycle/footer/watch plumbing in `@asdl/pi-extensions`; CCC owns repo-opinionated cmux/workspace/sidebar orchestration and operational worktree-status facts/presentation.

Do not put raw cmux mutation sequences in long skill bodies when a tested `asdl exec` command can own them.

## Command suite

The project-local adapter registers:

- `/ccc:sidebar:pr-summary`
- `/ccc:sidebar:objective-summary [objective-slug-or-path]`
- `/ccc:workspace:open-branch [branch]`
- `/ccc:workspace:dispatch-plan [--dry-run]`
- `/ccc:workspace:dispatch-prompt <prompt>`

`open` commands only open a cmux workspace. `dispatch` commands open a cmux workspace and immediately start child Pi execution. Old cmux-prefixed compatibility aliases are not current project commands unless reintroduced by an explicit future migration.

There is no legacy `set-workspace-summary` alias.

The old refresh-meta command was intentionally removed and not replaced. It only refreshed the current workspace name/description and did not open a new workspace; future metadata refresh behavior should be designed around `asdl exec cmux-workspace-summary`, not raw cmux mutations.

## Duplicate command troubleshooting

If `/reload` shows duplicate CCC workspace/sidebar commands with numeric suffixes, the canonical project source should still be `.pi/extensions/ccc.ts` plus `ts/packages/ccc/src/cmux/`. Check only the known user-local extension directory for stale migrated files:

```bash
find /Users/schrockn/.pi/agent/extensions -maxdepth 2 \
  \( -name 'ccc*.ts' -o -name 'cmux*.ts' -o -path '*/shared/branch-slug.ts' \) -print | sort
```

Remove stale user-local extension files only after confirming the project adapter registers the command suite. Do not run a broad home-directory search for duplicate Pi resources.

## Automatic sidebar updates are disabled

Workspace-opening commands currently do not auto-run sidebar updates after success:

- `/ccc:workspace:dispatch-plan`
- `/ccc:workspace:open-branch`
- `/ccc:workspace:dispatch-prompt`

The previous automatic flow targeted the workspace running the command via `CMUX_WORKSPACE_ID` or `CMUX_TAB_ID`, not the newly opened workspace. New-workspace targeting should be designed during a future CCC/cmux targeting pass rather than inferred from `cmux workspace list` in this slice.

The new workspace still receives initial `cmux new-workspace --name ... --description ... --cwd ...` fields from the launching command. Commands that launch a child Pi session must pass the caller's current `--provider`, `--model`, and non-off `--thinking` explicitly instead of relying on Pi's mutable default model settings.

## Caller workspace contract

Manual sidebar commands resolve the caller workspace from process environment only:

```typescript
process.env.CMUX_WORKSPACE_ID ?? process.env.CMUX_TAB_ID
```

If no caller workspace is available, notify and return. Do not fall back to the focused workspace because a background Pi session can be running while another cmux workspace is focused.

The PR sidebar skill and deterministic Objective sidebar extension do not pass `--workspace`; `asdl exec cmux-workspace-summary` resolves the same caller workspace env itself.

## Model choice and speed

PR sidebar updates are low-stakes semantic compression. The controller temporarily switches the follow-up PR turn to a faster model and minimal thinking:

- env override: `ASDL_CCC_SIDEBAR_MODEL=provider/model`
- default: `openai-codex/gpt-5.4-mini`
- thinking level: `minimal`

The controller restores the previous model and thinking level on `agent_end`. If the fast model is missing or unavailable, it warns and uses the current model.

## PR prompt shape

For `/ccc:sidebar:pr-summary`, the model should generate only these fields:

- `title`
- `description`

The description is exactly one short line:

```text
Goal: ...
```

Prompt-only length enforcement is intentional for PR sidebar for now. Do not add deterministic PR validation unless the design changes.

## Variants

`/ccc:sidebar:pr-summary` summarizes current PR, branch, or active implementation work through the model-assisted `ccc-sidebar` skill. The Goal line describes the PR outcome, not the cmux update itself.

`/ccc:sidebar:objective-summary [objective-slug-or-path]` formats an active asdl Objective deterministically. It accepts a slug or `.asdl/objectives/<slug>/...` path; if no selector is supplied, it opens a deterministic active-Objective picker like `/objective:update`. After selection, it validates the selected Objective slug/readability through `objective exec read-objective` and applies fixed fields through `pi.exec("asdl", [...])`: title/topline `obj:<objective-slug>` and description `<slot-slug>::<branch-slug>`. It does not queue a model prompt, read Objective prose, invoke the `ccc-sidebar` skill, or infer an Objective from branch, PR, hidden context, or conversation text.

## Apply through exec, not raw cmux

The PR sidebar skill should tell the model to call exactly one deterministic command when the source is resolved:

```bash
asdl exec cmux-workspace-summary \
  --title 'Short title' \
  --description 'Goal: ...' \
  --format json
```

Do not assign shell variables, do not write an env prelude, and do not pass `--workspace` from the skill. The Objective sidebar extension calls the same command directly with argv rather than asking an agent to write shell. The command clears the legacy `pi-summary` cmux status pill. The JSON envelope must have `exit_code: 0` and `data.success: true`. The PR assistant should then reply only with the applied title.

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

The PR sidebar implementation injects a normal follow-up user message with the expanded skill block. That means the control prompt, assistant response, and tool result can appear in future model context. Filtering those traces is intentionally not implemented for PR sidebar in this pass.

The Objective sidebar implementation avoids this pollution by staying in direct extension code: no `pi.sendUserMessage`, no model switch, and no skill prompt.

## Future PR “agent writes no bash” target

Objective sidebar already follows the direct extension apply path. If PR sidebar should require no model-authored shell in a future iteration, make the extension own the PR summary-and-apply loop:

1. Use Pi model APIs or an existing fast-draft helper to generate a small JSON object for the fields.
2. Validate and shorten fields in TypeScript.
3. Call `pi.exec("asdl", ["exec", "cmux-workspace-summary", ...])` with argv.
4. Display the resulting title directly.

That design would keep semantic PR summarization in a model while making quoting, cmux targeting, and command execution fully deterministic. It would also remove the PR skill-driven bash block from the conversation. Reintroducing automatic summaries should wait until that targeting and apply path are explicit.

## Validation checklist

After changing CCC workspace/sidebar Pi resources:

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
/ccc:sidebar:pr-summary
/ccc:sidebar:objective-summary <objective-slug>
/ccc:workspace:dispatch-plan --dry-run
/ccc:workspace:open-branch <branch>
/ccc:workspace:dispatch-prompt <prompt>
```
