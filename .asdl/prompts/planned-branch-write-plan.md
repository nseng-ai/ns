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

Subagent orchestration opportunities:
- Explicitly consider whether subagent orchestration is useful for the implementation plan.
- Recommend subagents only for non-trivial, context-bounded work with clear ownership, independent validation, and enough complexity or evidence volume to justify delegation.
- For editing work, suggested items should have independent context and clear file/symbol ownership. For read-only investigation or classification, context isolation may be sufficient.
- Prefer ordered waves: prerequisites first when needed, then independent groups or waves, then parent integration and validation.
- Do not require a strict machine-readable schema or mandatory fields. Instead, apply a launch-readiness quality bar: each suggested item must contain enough context for a fresh implementation agent to draft a focused subagent prompt and for the parent to validate success.
- If no delegation is useful, include `Subagent orchestration opportunities: none` with a one-sentence rationale.
- For editing subagents in one worktree, recommend sequential dispatch and parent validation after each editing subagent: inspect status and final text, review the git diff for declared scope, run targeted checks, and stop or escalate on unexpected files or failed validation.
- Do not imply that planned-branch runtime will automatically launch, schedule, or parse subagent work. The saved plan should identify opportunities for an implementation agent to use manually.

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