# objective-autorun — run digest and telemetry

Reached from `SKILL.md` when the run stops and you are about to write the run report.
Holds the runner-subagent digest-telemetry procedure and the exact `## Autorun digest`
structure the final response must emit.

## Runner subagent usage telemetry

Before the final response, collect the non-empty subagent session file paths the harness
returned for this run's dispatches, when available.

If no subagent session files are available:

- do not run `ns objective exec runner-subagent-usage`;
- state: `Runner subagent usage telemetry unavailable: no subagent session file paths were returned.`

If one or more subagent session files are available, run:

```bash
ns objective exec runner-subagent-usage --format md <session-file>...
```

If the command succeeds, include its Markdown output directly when compact enough. Otherwise, compactly transcribe the aggregate totals, model refs, and any non-ok per-file rows.

If the command fails, include the attempted command, quote the stdout/stderr failure text, and state that telemetry is unavailable due to command failure.

If the command reports rows such as `missing`, `not_file`, `read_error`, `invalid_json`, or `no_usage`, keep the overall digest. Call out unavailable subagent rows and trust the command aggregate for ok sessions only.

Use telemetry only for factual usage accounting: per-subagent and aggregate tokens, cost, peak observed token usage, model refs, and unavailable/error statuses. Do not use telemetry to infer subagent completion, code correctness, test sufficiency, or Objective closure. Do not claim a configured context-window capacity unless the subagent session logs expose it. Do not parse freeform subagent final text for usage metrics.

## Final response requirements

When the run stops, produce a final response with a section titled exactly:

```md
## Autorun digest
```

Use this structure, adapting details honestly to the run:

```md
## Autorun digest

### Objective

- slug: `<objective-slug>`
- state: open/closed/unknown

### Steps run

| step | branch     | checkpoint status | report path             | commit           |
| ---- | ---------- | ----------------- | ----------------------- | ---------------- |
| 1    | `<branch>` | `<status>`        | `<path-or-unavailable>` | `<hash-or-none>` |

Include every attempt, including `--recover` attempts, with its checkpoint status
(`committed`, `stop`, `blocked`, `verification-failed`, `malfunction`).

### What changed

- Parent-authored summary of meaningful code, prompt, test, or docs changes across the run.
- Mention files changed only when they help the reader inspect the run.

### Runner subagent usage

- Include `ns objective exec runner-subagent-usage --format md ...` output, a compact transcription, or the explicit unavailable reason.
- Keep telemetry separate from the checkpoints' verified facts.

### Objective tracking

- Semantic Updates recorded: yes/no, with file names if known.
- Updates still needed: yes/no, with reason.

### Parent publication

- Publication mode: off / bound / unavailable.
- Bound target when enabled: Objective slug, branch, existing PR number/URL/head branch, without credentials or authorization payload content.
- Per committed step: local Runner commit, optional parent tracking commits, branch-push outcome, and managed PR-summary outcome (`updated`, `pushed-pr-update-failed`, or not attempted).
- Keep runner-attested facts, child-reported validation claims, and parent judgments visibly distinct. Never present a child claim as publication evidence.
- Authorization scratch cleanup: completed / failed / not applicable. A PR-summary failure does not erase a successful push and must be reported as a successful-partial outcome.

### Recommended next action

- Continue with another run / inspect the branch stack / run objective-update / close Objective / ask for product decision.
- State that HEAD is on the last step's branch. If publication was off or unavailable, state that push/submit/PR actions were intentionally not performed. If parent publication ran, state its exact bounded outcome and confirm that no submit, PR creation, force-push, merge/land, deployment, or other external action occurred.
```
