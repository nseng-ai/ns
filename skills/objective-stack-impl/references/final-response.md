# objective-stack-impl — telemetry and final response

Reached from `SKILL.md` when you hit a stop condition and are about to write the final
response. Holds the runner-subagent digest-telemetry procedure and the exact
`## Stack implementation digest` structure the final response must emit.

## Stack implementation digest telemetry

Before the final response, use the current-session slice result list to collect all non-empty subagent session file paths.

If no subagent session files are available:

- do not run `objective exec runner-subagent-usage`;
- state: `Runner subagent usage telemetry unavailable: no subagent sessionFile paths were returned.`

If one or more subagent session files are available, run:

```bash
objective exec runner-subagent-usage --format md <session-file>...
```

If the command succeeds, include its Markdown output directly when compact enough. Otherwise, compactly transcribe the aggregate totals, model refs, and any non-ok per-file rows.

If the command fails, include the attempted command, quote the stdout/stderr failure text, and state that telemetry is unavailable due to command failure.

If the command reports rows such as `missing`, `not_file`, `read_error`, `invalid_json`, or `no_usage`, keep the overall digest. Call out unavailable subagent rows and trust the command aggregate for ok sessions only.

Use telemetry only for factual usage accounting: per-subagent and aggregate tokens, cost, peak observed token usage, model refs, and unavailable/error statuses. Do not use telemetry to infer subagent completion, code correctness, test sufficiency, or Objective closure. Do not claim a configured context-window capacity unless the subagent session logs expose it. Do not parse freeform subagent final text for usage metrics.

## Final response requirements

When you stop, produce a final response with a section titled exactly:

```md
## Stack implementation digest
```

Use this structure, adapting details honestly to the run:

```md
## Stack implementation digest

### Objective

- slug: `<objective-slug>`
- state: open/closed/unknown

### Slices attempted

| slice     | branch     | subagent status | session file            | validation | commit           |
| --------- | ---------- | --------------- | ----------------------- | ---------- | ---------------- |
| `<slice>` | `<branch>` | `<status>`      | `<path-or-unavailable>` | `<result>` | `<hash-or-none>` |

### What changed

- Parent-authored summary of meaningful code, prompt, test, or docs changes.
- Mention files changed only when they help the reader inspect the run.

### Validation

- `<command>` — passed/failed/skipped, with short interpretation.

### Runner subagent usage

- Include `objective exec runner-subagent-usage --format md ...` output, a compact transcription, or the explicit unavailable reason.
- Keep telemetry separate from validation evidence.

### Objective tracking

- Objective updates recorded: yes/no, with file names if known.
- Updates still needed: yes/no, with reason.

### Recommended next action

- Inspect diff / continue next slice / run objective-update / close Objective / ask for product decision.
- State that PR submission was intentionally left undone unless the user requested it.
```
