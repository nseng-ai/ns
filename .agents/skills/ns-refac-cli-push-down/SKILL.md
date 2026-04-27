---
name: ns-refac-cli-push-down
description: "Move deterministic prompt work into tested CLI commands. Use for long procedural skills, embedded shell/jq, repeated data gathering, or token-heavy mechanical workflows."
---

# ns-refac-cli-push-down

Goal: fewer prompt tokens, fewer tool calls, more tested code. Meaning stays
in agent; mechanics move to CLI.

## Push-Down Targets

Good targets:

- Parse/validate structured data: JSON, YAML, TOML, URLs, paths, flags.
- Extract/filter/sort/group/join data from APIs, git, files, configs.
- Normalize environment/state: repo, branch, PR, CI, install metadata.
- Handle retries, pagination, auth checks, subprocess errors.
- Collapse repeated command sequences into one tested call.
- Pre-compute compact JSON so agent decides from facts, not logs.

Keep in prompt:

- Semantic reading, summarizing, naming, tradeoffs.
- Ambiguous decisions and user-facing prose.
- One-off simple shell commands where CLI adds little.

Size threshold — push down only when the win is meaningful:

- Removes 20+ prompt lines or 3+ tool calls.
- Eliminates loops the agent would run step by step.
- Bundles data currently gathered by several `gh`, git, filesystem, or API calls.
- Reused by 2+ skills/commands or run often.
- Needs edge-case tests: malformed data, missing refs, pagination, auth, partial failure.

Avoid small wins:

- Wrapper around one obvious command.
- Under 30 lines of logic and called once.
- Returns too little, forcing follow-up calls.
- Splits one workflow into many tiny commands with intermediate JSON.

Prefer one cohesive workflow command over staged micro-commands. The best
command returns everything needed for the agent's next decision.

## Hard Ban: Markdown Parsing

Push-down commands must not parse markdown.

No heading splits, checkbox counts, list extraction, loose title matching,
regex over prose, markdown tables, keyword tokenizers, or "known template"
parsers.

Markdown edited by humans/agents is not schema. If input is markdown:

- hand raw text to agent; or
- change upstream source to structured data, then parse that.

## CLI Contract

Command shape:

- Accept explicit args/flags. Avoid hidden prompt assumptions.
- Emit JSON to stdout. Logs go stderr.
- Top level includes `success: bool`.
- Failure includes `error.message`; include `error.code` when useful.
- Success includes all needed payload, plus a compact `summary` when helpful.
- Output should be stable enough for agents/tests. No prose-only output.

Example shapes:

```json
{"success": true, "summary": "...", "items": []}
```

```json
{"success": false, "error": {"code": "missing_ref", "message": "..."}}
```

## Refactor Workflow

1. Audit prompt/skill for mechanical blocks.
2. Pick the biggest win, not every small smell.
3. Define JSON contract before code.
4. Implement in project CLI framework.
5. Test happy path, failures, edge cases. Mock APIs/subprocess/filesystem.
6. Register command in CLI group.
7. Replace prompt block with one invocation and JSON interpretation rules.
8. Compare before/after line count; target 50%+ reduction for that block.

## Prompt After Push-Down

Keep only:

- exact command to run;
- expected JSON fields;
- how agent should decide from result;
- user-facing error behavior.

## Review Checklist

- Did we delete prompt logic, not just hide it behind another prompt section?
- Are edge cases covered by tests?
