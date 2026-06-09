# Subagent Launch Policy

Use this policy when an agent workflow can delegate focused artifact-backed inspection to a subagent or equivalent helper. The goal is to keep large command details in payload artifacts while preserving enough manifest evidence for the parent agent to validate the result before acting.

## When to Use Subagents

Use a subagent when all of these are true:

- the task has a focused question or classification goal;
- the relevant evidence is available through payload artifact paths, payload locators, or compact manifests;
- direct deterministic inspection, supported selected-detail lookup, or a short file read is not sufficient for the focused question;
- the subagent can read those artifacts in the same checkout or local environment;
- the parent agent can validate the subagent's final answer before using it.

Do not launch a subagent just to avoid making a deterministic CLI call, running a supported selected-detail lookup, or reading a short file directly. Prefer direct inspection for small artifact bodies and deterministic local work.

## Agent-to-Agent Interface Shape

Subagents should usually return compact prose or Markdown reports keyed by stable IDs, paths, or locators. The report should state coverage, findings or classifications, evidence inspected, confidence, and blockers. Do not make strict JSON schemas the default final-text protocol between LLM routines.

JSON is appropriate at deterministic boundaries, such as agent-to-CLI and tool-to-tool calls. When a downstream CLI needs a JSON packet, the parent agent owns constructing or filling that deterministic schema from the subagent's semantic report, then validating it before acting. Use a strict structured subagent contract only when the parent deliberately invokes terminal-capture mode, typed tool parameters, or another explicit structured capture mechanism.

For the broader methodology, see `docs/subagent-pushdown.md`.

## Passing File Paths and Locators

Pass artifact paths and locators instead of pasting large artifact bodies into the main transcript. A launch prompt should include:

- the absolute or checkout-relative path to each payload artifact the subagent must inspect;
- any JSON Pointer, line, item, or domain locator needed to focus the read;
- the exact question the subagent must answer;
- the expected return shape and completeness requirements;
- any safety limits, such as read-only behavior or no network access.

Treat JSON Pointer locators as exact RFC 6901 pointers into validated JSON payload artifacts, not as search queries or generic JSON-query expressions.

The parent agent should keep compact manifests, identifiers, counts, payload references, payload locators, and validation rules in the main context. The subagent should inspect selected artifact details and cite the paths or locators it used.

## Pi Launch Guidance

When Pi exposes a runner-subagent tool, launch one focused runner subagent at a time with a complete prompt containing all necessary context. Treat only a final assistant text result as a usable answer. Inspect returned status evidence before deciding the work is complete.

When the harness exposes per-dispatch model selection, bounded artifact-backed classification or summarization tasks may request a cheaper/faster model. In Pi, the canonical cheap classification model is `openai-codex/gpt-5.4-mini:medium`; when a workflow needs a concrete stronger escalation target, use `openai-codex/gpt-5.5:high`. The parent must still validate the result against deterministic manifests, schemas, counts, or locators, and must escalate to a stronger model when validation fails or judgment requires broader code context.

Do not run parallel subagents in the same worktree unless the parent workflow has explicitly proved the tasks are independent and safe. If the subagent edits files, the parent must verify the diff and validation evidence before continuing.

## Claude Launch Guidance

When Claude has an available subagent or task tool, use it for focused artifact-backed inspection by passing the local artifact paths, locators, and expected return contract. If no such tool is available in the current harness, do not pretend delegation occurred; use the fallback behavior instead.

Keep the launch prompt self-contained. Do not rely on hidden parent conversation state that the subagent may not receive.

## Codex Launch Guidance

When Codex has an available subagent or task runner, use it only for focused inspection or summarization that can be answered from supplied artifact paths and locators. Include the expected final-answer structure and ask the subagent to report missing files, unreadable paths, unsupported locators, or incomplete coverage explicitly.

If the current Codex harness has no suitable delegation primitive, use the fallback behavior instead of pasting full raw artifact bodies into the main transcript.

## Fallback Behavior

When no suitable delegated inspector is available, prefer deterministic selected-detail lookup, targeted file reads, or an explicit inline/full-output debugging mode if the workflow provides one. Keep the main transcript as compact as possible and avoid dumping large raw JSON or logs by default.

If none of the fallback paths can provide enough evidence, stop and report the limitation instead of acting on an incomplete summary.

## Safety and Failure Behavior

Subagents should be read-only unless the parent workflow explicitly authorizes edits. A parent agent must fail closed when the subagent answer is missing required coverage, cites unknown locators, reports unreadable evidence, cannot account for required manifest counts or payload references, or returns a malformed structure.

A useful subagent final answer should be compact and structured. It should state what was inspected, cite the relevant paths or locators, account for the requested coverage, summarize findings or classifications, and name blockers or uncertainties. The parent remains responsible for validating that answer against deterministic manifests, counts, locators, or schemas before taking action.
