# Plan: Print cost and token usage when `reviewer review run` completes

## Context

The `reviewer review run` CLI ( `twerk-reviewer` package) dispatches the review
through a harness subprocess — currently `claude -p --output-format stream-json
--verbose --bare …`. Claude Code's terminal `result` event already carries all
the data we need (`total_cost_usd`, `usage.input_tokens`,
`usage.cache_creation_input_tokens`, `usage.cache_read_input_tokens`,
`usage.output_tokens`, `duration_ms`, `num_turns`), but the adapter discards it
— only `duration_ms` / `num_turns` leak into the stderr progress line via
`describe_event`. The user wants cost + token info printed alongside the review
output so each run makes its spend and shape visible.

We'll thread usage data through the existing harness → workflow → CLI pipeline,
print it in the human renderer, and include it in the JSON output. Usage stays
optional so future harnesses that don't expose it still work.

## Shape of the change

A new frozen `ReviewUsage` dataclass carries the stats. The Claude Code
adapter extracts it from the `result` event. The workflow propagates it into
`LocalReviewResult`. The human renderer prints a short usage block after the
existing `Reviewer / Model / Base ref` header; `to_json_dict()` serializes it
for the JSON output mode. The data path mirrors the existing `payload` field —
nothing about dispatch or workflow changes shape, we just carry one more
struct.

## Files to modify

### 1. `packages/twerk-reviewer/src/twerk_reviewer/models.py`

Add a `ReviewUsage` frozen dataclass (near `ReviewExecutionResponse`, ~line
427) with fields:

- `input_tokens: int`
- `output_tokens: int`
- `cache_creation_input_tokens: int`
- `cache_read_input_tokens: int`
- `total_cost_usd: float`
- `duration_ms: int`
- `num_turns: int`

Add `total_input_tokens` property: `input_tokens + cache_creation_input_tokens
+ cache_read_input_tokens` (so the renderer can show a headline number without
doing arithmetic inline). Add `to_json_dict()` that mirrors the field names.

Extend two existing dataclasses:

- `ReviewExecutionResponse` (line 428): add `usage: ReviewUsage | None = None`.
- `LocalReviewResult` (line 436): add `usage: ReviewUsage | None = None`, and
  include `"usage": self.usage.to_json_dict() if self.usage else None` in
  `to_json_dict()`.

### 2. `packages/twerk-reviewer/src/twerk_reviewer/harness/claude/adapter.py`

In `_claude_code_parse_stdout` (line 166), after `_extract_result_event`
succeeds, build a `ReviewUsage` from the result event using a new helper
`_extract_usage(result_event) -> ReviewUsage | None`. The helper reads
`total_cost_usd`, `duration_ms`, `num_turns`, and the nested `usage.*` fields;
any missing field → return `None` rather than failing the parse (usage is
diagnostic, not required for correctness). Pass the usage into both
`ReviewExecutionResponse(payload=..., usage=usage)` constructions (the
findings path via `_parse_findings_payload` and the prose path).

`_parse_findings_payload` needs to accept and attach the usage too — either
pass it as a second arg or attach it after return in the caller.

### 3. `packages/twerk-reviewer/src/twerk_reviewer/workflow.py`

In `run_review_by_key` (line 106), propagate `execution_response.usage` into
the `LocalReviewResult(...)` kwargs.

### 4. `packages/twerk-reviewer/src/twerk_reviewer/cli/reviewer/review/run.py`

In `render_review_run` (line 63), after the `Base ref:` line and before the
payload, add a block when `result.usage` is not `None`:

```
Tokens: {total_input} in / {output} out (cache read: {cache_read}, cache create: {cache_create})
Cost: ${total_cost_usd:.4f} USD
Duration: {duration_ms/1000:.1f}s ({num_turns} turns)
```

Formatting notes: use `f"{…:,}"` for token counts so big numbers stay
readable; `:.4f` on cost so small runs don't collapse to `$0.00`; keep the
format compact — three lines.

### 5. Tests

`packages/twerk-reviewer/tests/unit/test_claude_adapter.py` — extend the
result-event fixtures (around line 57) to include `total_cost_usd` and a
nested `usage` dict. Add assertions that both the text and findings code paths
surface a populated `ReviewUsage`. Add one test where `usage` / `total_cost_usd`
is missing to confirm we degrade to `None` rather than raising.

`packages/twerk-reviewer/tests/unit/` (new or existing renderer test) — add
a test for `render_review_run` that captures stdout via Click's
`CliRunner`/`capsys` and asserts the usage block appears when `LocalReviewResult`
carries usage, and is omitted when it's `None`.

`packages/twerk-reviewer/tests/scenario/` — if there's an end-to-end scenario
that stubs the execution gateway, thread a fake `ReviewUsage` through and
assert it round-trips into the JSON output.

Check each package has `tests/unit/` and `tests/scenario/` per the
`ns-fake-driven-test-layout` convention before placing new test files.

## Non-goals

- No pricing-table / cost-recomputation logic. We trust Claude Code's
  `total_cost_usd`.
- No new flag to toggle the usage print. It's always on (cheap, short).
- No work on harnesses other than Claude Code. The field is optional so other
  adapters just leave it `None`.
- No changes to `describe_event` progress output — it already shows
  turns/duration. We're adding a terminal summary, not replacing progress.

## Verification

1. `just check` — ruff, ty, pytest green.
2. Hand-run against a real diff:
   ```
   cd /Users/schrockn/.slots/repos/twerk/worktrees/slot-06
   uv run reviewer review run <existing-review-key>
   ```
   Confirm the `Tokens: … / Cost: … / Duration: …` block appears after `Base
   ref:` and before the prose/findings body. Repeat with `--format findings`
   to confirm the block still shows (it precedes the findings list).
3. JSON output sanity check: invoke the CLI with the structured-output mode
   (the `clinkr_operation` machinery emits JSON when the global `--format json`
   is set, cf. `twerk_core.clinkr.operation`). Confirm the resulting JSON
   includes a populated `usage` object.
4. Failure-mode sanity check: temporarily mutate the adapter to drop `usage`
   from the parsed event, re-run, confirm the CLI still prints the review body
   but omits the usage block.

## Critical files (quick reference)

- `packages/twerk-reviewer/src/twerk_reviewer/models.py` — new `ReviewUsage`;
  extend `ReviewExecutionResponse` and `LocalReviewResult`.
- `packages/twerk-reviewer/src/twerk_reviewer/harness/claude/adapter.py` —
  extract usage from `result` event in `_claude_code_parse_stdout`.
- `packages/twerk-reviewer/src/twerk_reviewer/workflow.py` — propagate usage
  into `LocalReviewResult`.
- `packages/twerk-reviewer/src/twerk_reviewer/cli/reviewer/review/run.py` —
  print usage block in `render_review_run`.
- `packages/twerk-reviewer/tests/unit/test_claude_adapter.py` — extend
  fixtures; add extraction tests.

## Self-destruct

This plan file is a durable spec for the branch it lives on, not a
permanent artifact. Once the plan is fully implemented, the final
commit of this branch must delete this file (`plan-print-reviewer-cost-and-tokens.md`). A
merged PR whose branch still contains its own plan file is evidence
the plan was not fully carried out.
