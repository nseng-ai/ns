# objective-autorun — mode-aware run digest

Read this reference when the run stops. It defines optional dispatch telemetry and the exact final digest shape.

## Dispatch telemetry

Collect non-empty implementation-subagent session file paths returned by the harness, when available. Telemetry is accounting only: never use it as evidence of completion, correctness, validation, or Objective closure.

The helper is optional. Call:

```bash
ns objective exec runner-subagent-usage --format md <session-file>...
```

only when both conditions hold:

1. at least one session file path is available; and
2. `ns objective exec runner-subagent-usage --help` succeeds.

If the command succeeds, include its compact Markdown output or transcribe aggregate totals, model refs, and non-ok rows. Preserve `missing`, `not_file`, `read_error`, `invalid_json`, and `no_usage` rows honestly.

Otherwise report one precise reason:

- `Dispatch usage telemetry unavailable: no subagent session file paths were returned.`
- `Dispatch usage telemetry unavailable: runner-subagent-usage helper is not installed.`
- `Dispatch usage telemetry unavailable: helper failed: <compact stdout/stderr>.`

Telemetry absence never fails the run. Do not parse freeform child prose for usage metrics or infer a configured context-window capacity.

## Final response requirements

Finish with a section titled exactly:

```md
## Autorun digest
```

Use this structure and adapt details honestly:

```md
## Autorun digest

### Objective

- slug/path: `<objective>`
- state: open/closed/unknown
- execution mode: `ns-bookended` / `portable`
- verification authority: `runner-attested` / `parent-verified`

### Attempts

| attempt | mode     | authority     | branch     | status     | runner report path           | implementation commit |
| ------- | -------- | ------------- | ---------- | ---------- | ---------------------------- | --------------------- |
| 1       | `<mode>` | `<authority>` | `<branch>` | `<status>` | `<path>` or `not applicable` | `<hash-or-none>`      |
```

Include every default and recovery attempt.

For `ns-bookended`, use checkpoint statuses: `committed`, `stop`, `blocked`, `verification-failed`, or `malfunction`. The report path is the fresh runner report path.

For `portable`, use parent-judgment statuses: `committed`, `stopped`, `blocked`, `verification-failed`, or `dispatch-malfunction`. The runner report path is always `not applicable`. Never call a portable result a checkpoint or runner-attested.

Continue with:

```md
### What changed

- Parent-authored summary of meaningful changes.
- Files only when they help inspection.

### Validation evidence

- Bookended: runner-attested gate/validation facts, with child claims separately labeled.
- Portable: checks the parent directly inspected or ran, with child claims separately labeled and never promoted to proof.

### Dispatch usage

- Helper output or the exact unavailable reason.

### Objective tracking

- Semantic Updates recorded: yes/no, with files and commits when known.
- Tracking commits: `<hashes>` / none.
- Updates still needed: yes/no, with reason.

### Publication

- Publication state: `off` / `bound` / `unavailable/not applicable`.
- `bound` is legal only for `ns-bookended` after a real committed Runner Checkpoint and ADR 0037 authorization.
- Portable mode always says `unavailable/not applicable`; no runner publisher was invoked.
- For bound bookended publication, report the exact existing-PR binding, local Runner commit, optional tracking commits, push outcome, managed-summary outcome, and authorization scratch cleanup without exposing credentials.

### Recommended next action

- Continue another run / inspect the branch / record tracking / close the Objective / ask for a decision.
- State where HEAD remains.
- If publication was off or unavailable, state that push, submit, and PR actions were intentionally not performed.
- If bound publication ran, report its exact bounded outcome and confirm that no PR creation, submit, force-push, merge/land, deployment, or other external action occurred.
```

Keep these evidence classes separate throughout:

- runner-attested facts from `runner-finish`;
- parent-verified portable repository facts;
- unverified child narrative;
- parent judgment and Objective tracking;
- external publication outcomes.
