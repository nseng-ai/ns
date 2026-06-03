# cmux Extension Pattern for Pi

This guide captures the repo-local pattern for Pi commands that update cmux workspace metadata. It is based on the
`/cmux:set-workspace-summary` implementation and the installed cmux CLI behavior verified during that work.

## Use this pattern when

- The command labels or annotates the current cmux workspace from Pi session context.
- The target must be the workspace that launched this terminal, not whatever cmux workspace is focused now.
- The behavior is repo-local to `asdl-tools` and should not become a global Pi extension.
- The workflow needs a short semantic model pass but deterministic cmux mutation.

## Layering

Current layers:

| Layer                | Path / command                                 | Responsibility                                   |
| -------------------- | ---------------------------------------------- | ------------------------------------------------ |
| Pi discovery adapter | `.pi/extensions/cmux-set-workspace-summary.ts` | Registers `/cmux:set-workspace-summary`          |
| Local skill          | `skills/cmux-set-workspace-summary/SKILL.md`   | Tells the model what fields to generate          |
| Deterministic CLI    | `asdl exec cmux-workspace-summary`             | Applies title, description, and status           |
| cmux gateway         | `src/asdl_tools/cmux/gateway.py`               | Runs installed cmux CLI commands                 |
| Scenario tests       | `tests/scenario/test_cli.py`                   | Covers root exec behavior over `FakeCmuxGateway` |

Do not put raw cmux mutation sequences in long skill bodies when a tested `asdl exec` command can own them.

## Caller workspace contract

The extension should resolve the caller workspace from process environment only:

```typescript
process.env.CMUX_WORKSPACE_ID ?? process.env.CMUX_TAB_ID
```

If no caller workspace is available, notify and return. Do not fall back to the focused workspace because a background
Pi session can be running while another cmux workspace is focused.

## Model choice and speed

Workspace summaries are low-stakes semantic compression. The current extension temporarily switches the follow-up
turn to a faster model and minimal thinking:

- env override: `ASDL_CMUX_SUMMARY_MODEL=provider/model`
- default: `openai-codex/gpt-5.4-mini`
- thinking level: `minimal`

The extension restores the previous model and thinking level on `agent_end`. If the fast model is missing or unavailable,
it warns and uses the current model.

## Prompt shape

The model should generate only these fields:

- `title`
- `goal`
- `currentState`
- `nextAction`
- `status`

The skill currently enforces length limits by prompt instruction:

| Field          | Limit          |
| -------------- | -------------- |
| `title`        | 45 characters  |
| `goal`         | 100 characters |
| `currentState` | 100 characters |
| `nextAction`   | 100 characters |
| `status`       | 20 characters  |

Prompt-only length enforcement is intentional for now. Do not add deterministic validation unless the design changes.

## Apply through exec, not raw cmux

The skill should tell the model to call:

```bash
asdl exec cmux-workspace-summary \
  --workspace "$workspace" \
  --title "$TITLE" \
  --goal "$GOAL" \
  --current-state "$CURRENT_STATE" \
  --next-action "$NEXT_ACTION" \
  --status "$STATUS" \
  --format json
```

The JSON envelope must have `exit_code: 0` and `data.success: true`. The assistant should then reply only with the
applied title and status.

See [`../asdl-exec/cmux-workspace-summary.md`](../asdl-exec/cmux-workspace-summary.md) for the exec contract and
[`../cmux/cli-reference.md`](../cmux/cli-reference.md) for cmux CLI facts.

## Avoid stale cmux source

Do not inspect or rely on `/Users/schrockn/code/githubs/manaflow-ai/cmux` for behavior unless that checkout has been
updated and revalidated. Use installed `cmux --help` surfaces instead.

## Context pollution

The current implementation injects a normal follow-up user message with the skill block. That means the control prompt,
assistant response, and tool result can appear in future model context. Filtering those traces is intentionally not
implemented in the first pass.

If future summaries start describing earlier summary refreshes, design a context-filtering extension hook or move the
whole flow into direct extension code.

## Future “agent writes no bash” target

If the next iteration should require no model-authored shell at all, make the extension own the summary-and-apply loop:

1. Use Pi model APIs or an existing fast-draft helper to generate a small JSON object for the five fields.
2. Validate and shorten fields in TypeScript.
3. Call `pi.exec("asdl", ["exec", "cmux-workspace-summary", ...])` with argv.
4. Display the resulting title/status directly.

That design keeps the semantic summary model-powered while making quoting, cmux targeting, and command execution fully
deterministic. It also removes the skill-driven bash block from the conversation.

## Validation checklist

After changing cmux-related Pi resources:

```bash
just dprint-check
just ts-check
uv run pytest tests/scenario/test_cli.py
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
/cmux:set-workspace-summary
```
