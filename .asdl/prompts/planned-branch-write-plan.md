Plan audience and context contract:
- Treat the saved Markdown plan as the only planning context available to a completely fresh downstream implementation session.
- Make the plan self-contained. Do not rely on this conversation, hidden context, tool transcripts, or "as discussed" references.
- Embed all relevant context discovered during planning, including user goals, constraints, current behavior, important files/symbols/tests/docs, decisions made, rationale, rejected alternatives, assumptions, risks, and validation commands.
- Prefer concrete file paths, symbol names, command names, expected outcomes, and implementation order over vague instructions.
- If you inspected evidence during planning, summarize the discovered facts in the plan so the downstream agent does not need to rediscover them unless verification is required.

External research/context contract:
- If planning used anything outside the repository — web searches, external docs, GitHub issues/PRs, API docs, CLIs hitting remote services, local files outside the repo, or other non-repo resources — include the relevant findings inline in the saved plan.
- Do not merely link to external resources. Summarize the concrete facts, constraints, examples, decisions, and caveats the downstream agent needs.
- Include source/provenance where useful: URL, command, document name, issue/PR number, accessed date/time if known, and why it mattered.
- If external findings may become stale, mark what should be revalidated during implementation.
- Do not include secrets, credentials, private tokens, or unnecessary sensitive data.

Recommended saved plan sections:
- Goal and user-visible outcome.
- Planning context and discovered facts, including relevant repository state.
- External/off-repo research context, or a note that none was used when that helps remove ambiguity.
- Files, symbols, commands, and tests likely to change.
- Step-by-step implementation approach.
- Validation commands and expected results.
- Risks, assumptions, edge cases, and open questions.
- Subagent orchestration opportunities.
- Review and remediation plan.

Subagent orchestration opportunities:
- Explicitly consider whether subagent orchestration is useful for the implementation plan.
- Recommend subagents only for non-trivial, context-bounded work with clear ownership, independent validation, and enough complexity or evidence volume to justify delegation.
- For editing work, suggested items should have independent context and clear file/symbol ownership. For read-only investigation or classification, context isolation may be sufficient.
- Prefer ordered waves: prerequisites first when needed, then independent groups or waves, then parent integration and validation.
- Do not require a strict machine-readable schema or mandatory fields. Instead, apply a launch-readiness quality bar: each suggested item must contain enough context for a fresh implementation agent to draft a focused subagent prompt and for the parent to validate success.
- If no delegation is useful, include `Subagent orchestration opportunities: none` with a one-sentence rationale.
- For editing subagents in one worktree, recommend sequential dispatch and parent validation after each editing subagent: inspect status and final text, review the git diff for declared scope, run targeted checks, and stop or escalate on unexpected files or failed validation.
- If suggesting editing or implementation subagents, do not include a `model` recommendation unless a strong implementation model is explicitly required. Review-model defaults are not applicable to editing work.
- Do not imply that planned-branch runtime will automatically launch, schedule, or parse subagent work. The saved plan should identify opportunities for an implementation agent to use manually.

Subagent model routing:
- For implementation/editing subagents:
  - Do not set `dispatch_runner_subagent.model` to a cheap/review model.
  - Prefer omitting the `model` field so the harness/current session default is used.
  - Only set an explicit model for editing work if the user or command explicitly provides one.
- For review-only subagents:
  - Cheap model routing applies only to bounded diff review tasks.
  - When launching a review subagent from `reviews/typescript-style.md` or `reviews/dignified-python.md`, use that review definition's `default_model` if available.
  - Never reuse review model guidance for implementation, package creation, refactors, or test-writing subagents.

Review and remediation plan:
- The cheap-model guidance in this section is exclusively for in-session review subagents after implementation is complete. It must not be applied to any subagent that creates files, edits code, writes tests, migrates APIs, or performs implementation work.
- Plans should include applicable in-session roaster-style reviews after implementation and focused validation, run through focused review subagents.
- Review subagents are bounded diff inspections, so only review-only subagents should be routed to a cheap review-capable model when the harness supports per-dispatch model selection. In Pi, instruct the implementation agent to set `dispatch_runner_subagent.model` to the review definition's `default_model` value when that model is available; the current `reviews/typescript-style.md` and `reviews/dignified-python.md` definitions both declare `default_model: haiku`. For OpenAI-family Pi routing, use the shared cheap model pattern `openai-codex/gpt-5.4-mini:medium`; escalate to `openai-codex/gpt-5.5:high` only when validation fails or broader judgment is required. If the harness cannot force a per-dispatch model, say that the cheap-model request is unavailable instead of implying it happened.
- If TypeScript-family files (`.ts`, `.tsx`, `.mts`, `.cts`) are likely to change, include an in-session `typescript-style` review subagent that reads `reviews/typescript-style.md` and applies it to the changed diff.
- If Python files (`.py`) are likely to change, include an in-session `dignified-python` review subagent that reads `reviews/dignified-python.md` and applies it to the changed diff.
- If both TypeScript and Python changes are likely, include both review subagents. If neither applies, say that no TypeScript/Python roaster review subagent is applicable.
- If a plan includes a `simplify` review subagent, explicitly limit it to one run total. Do not ask the implementation agent to rerun `simplify` after remediating findings; it should inspect the one result, fix easy findings, validate, and stop or report remaining judgment calls.
- Do not invoke the external roaster review runner for this closeout; the implementation agent launches focused subagents to perform reviews in-session from the review definition files.
- Plans should instruct the implementation agent to inspect each review subagent's final text/status before acting on findings.
- Plans should instruct the implementation agent to automatically remediate easy findings: local, mechanical, low-risk fixes that are clearly correct from nearby context and require no product, API, ownership, or design decision.
- Plans should instruct the implementation agent to re-run focused validation after easy fixes. For applicable TypeScript/Python closeout reviews, repeat the relevant in-session review subagent after easy fixes; never repeat a `simplify` review subagent.
- Plans should instruct the implementation agent to stop automatic remediation and report complex findings to the user when findings are ambiguous, cross-cutting, behavior-changing, design-sensitive, or not clearly correct. The report should include path/line, why it was deferred, and recommended options.

Workflow:
1. Inspect the repository, documentation, and current conversation context as needed for the requested work.
2. Produce a detailed Markdown implementation plan.
3. Review the final Markdown plan content for completeness.
4. Call write_source_branch_plan_file with the full Markdown content and optional one-sentence summary; do not generate or pass a slug.
5. Report the saved plan evidence: file path, repo key, repo root, repo identity source, source branch, branch path segment, slug, slug model, and summary when present.
6. Stop after reporting the saved plan evidence. Do not create a branch, write Branch Memory, or call any plan-branch tool.

Local plan store contract:
- Path convention: ~/.asdl/planned-branch/plans/<repo>/<encoded-source-branch>/<slug>.md
- <repo>: for github.com origins, gh--<owner>--<repo> from sanitized GitHub owner and repo path segments; for non-GitHub or origin-less repos, one sanitized path segment from the normalized remote.origin.url or real repo root path
- <encoded-source-branch>: current branch at plan-file creation time encoded as one filesystem-safe path segment; branch slashes become --- (for example, planned-branches/add-widget becomes planned-branches---add-widget)
- <slug>: semantic kebab-case saved-plan filename slug without .md; this is a local plan-store locator, not necessarily the later implementation branch slug
- Existing saved plan file: write_source_branch_plan_file refuses to overwrite it; do not manually choose a replacement slug.
- Working-tree behavior: no checked-in plan file is created.

Saved-plan filename slug rules:
- write_source_branch_plan_file derives the final saved-plan filename slug from the final plan content through the Codex-backed slug model.
- Do not generate, guess, or pass a slug yourself.
- The derived slug is kebab-case, 3–7 words, specific to the work described by the final plan, and rejects dates, random IDs, and generic-only slugs.

When the plan is ready, call write_source_branch_plan_file with:
- content: the complete reviewed Markdown plan content
- summary: optional one-sentence summary of the plan

Exact tool call shape:
```json
{
  "content": "# Plan\n...",
  "summary": "One-sentence summary of the plan."
}
```

If summary is not useful, omit it from the tool call rather than passing an empty string. Do not create target branches or write Branch Memory in this workflow.