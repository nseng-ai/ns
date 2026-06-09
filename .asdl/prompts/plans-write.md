Plan audience and hermetic context contract:

- Treat the saved Markdown plan as the only planning context available to a completely fresh downstream implementation session.
- Make the plan self-contained with respect to planning knowledge. Do not rely on this conversation, hidden context, tool transcripts, or "as discussed" references.
- Preserve non-trivial planning knowledge needed to make the same decisions again: user intent, success criteria, constraints, decisions, rationale, rejected alternatives, assumptions, risks, validation expectations, and external/off-repo findings.
- Include repo facts only when they are decision-shaping, surprising, expensive to rediscover, or needed to prevent a likely wrong turn.
- Prefer concrete file paths, symbol names, command names, expected outcomes, and implementation order when they carry decision-critical context.

Repo-state compression contract:

- Do not restate information that a downstream agent can trivially reconstruct from the current repo with `rg`, file reads, or test discovery.
- Mention files/modules by area unless a specific path, symbol, or test is important to a decision, risk, or validation choice.
- If repo facts are included, explain why they matter to the plan.
- Optimize for launch-readiness, not exhaustive reproduction of planning transcripts.

Plan length target:

- Prefer 800–1500 words for ordinary implementation plans.
- Use 1500–2500 words for complex cross-cutting work, broad migrations, or plans with substantial external research.
- Exceed 2500 words only when necessary to preserve non-reconstructable context or avoid high-risk ambiguity.

External research/context contract:

- If planning used anything outside the repository — web searches, external docs, GitHub issues/PRs, API docs, CLIs hitting remote services, local files outside the repo, or other non-repo resources — include the relevant findings inline in the saved plan.
- Do not merely link to external resources. Summarize the concrete facts, constraints, examples, decisions, and caveats the downstream agent needs.
- Include source/provenance where useful: URL, command, document name, issue/PR number, accessed date/time if known, and why it mattered.
- If external findings may become stale, mark what should be revalidated during implementation.
- Do not include secrets, credentials, private tokens, or unnecessary sensitive data.

Recommended saved plan sections:

- Goal and user-visible outcome.
- Non-negotiable decisions and constraints.
- Non-trivial planning context, including external/off-repo findings if used.
- Relevant code areas and implementation slices.
- Validation commands and expected results.
- Risks, assumptions, edge cases, and open questions.
- Subagent orchestration opportunities.
- Closeout review plan.

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

Closeout review plan:

- Keep closeout guidance concise; do not paste reusable closeout boilerplate unless this plan needs a special exception.
- Plans should include exactly one in-session style review subagent per applicable review family, run after implementation is complete and focused validation has passed.
- The cheap-model guidance in this section is exclusively for review-only subagents after implementation is complete; never apply it to implementation/editing subagents. Review-only subagents may use the review definition's `default_model` when available. For OpenAI-family Pi routing, the cheap review-capable pattern is `openai-codex/gpt-5.4-mini:medium`.
- If TypeScript-family files (`.ts`, `.tsx`, `.mts`, `.cts`) are likely to change, include a single in-session `typescript-style` review subagent on the changed diff.
- If Python files (`.py`) are likely to change, include a single in-session `dignified-python` review subagent on the changed diff.
- Instruct the implementation agent to inspect review subagent final text/status, remediate only local/mechanical/low-risk findings, rerun focused validation after easy fixes, and report judgment calls instead of guessing. Do not tell the implementation agent to repeat TypeScript/Python style review subagents after remediation; the final PR review is the final style/quality checkstep.

Workflow:

1. Inspect the repository, documentation, and current conversation context as needed for the requested work.
2. Produce a launch-ready Markdown implementation plan that preserves non-trivial planning knowledge without mirroring easily rediscovered repo state.
3. Review the final Markdown plan content for hermeticity, proportionality, and completeness.
4. Call write_saved_plan_file with the full Markdown content and optional one-sentence summary; do not generate or pass a slug.
5. Report the saved plan evidence: file path, repo key, repo root, repo identity source, source branch, branch path segment, slug, slug model, and summary when present.
6. Stop after reporting the saved plan evidence. Do not create a branch, write Branch Memory, or call any planned-branch tool.

Local plan store contract:

- Path convention: ~/.asdl/planned-branch/plans/<repo>/<encoded-source-branch>/<slug>.md
- <repo>: for github.com origins, gh--<owner>--<repo> from sanitized GitHub owner and repo path segments; for non-GitHub or origin-less repos, one sanitized path segment from the normalized remote.origin.url or real repo root path
- <encoded-source-branch>: current branch at plan-file creation time encoded as one filesystem-safe path segment; branch slashes become --- (for example, planned-branches/add-widget becomes planned-branches---add-widget)
- <slug>: semantic kebab-case saved-plan filename slug without .md; this is a local plan-store locator, not necessarily the later implementation branch slug
- Existing saved plan file: write_saved_plan_file refuses to overwrite it; do not manually choose a replacement slug.
- Working-tree behavior: no checked-in plan file is created.

Saved-plan filename slug rules:

- write_saved_plan_file derives the final saved-plan filename slug from the final plan content through the Codex-backed slug model.
- Do not generate, guess, or pass a slug yourself.
- The derived slug is kebab-case, 3–7 words, specific to the work described by the final plan, and rejects dates, random IDs, and generic-only slugs.

When the plan is ready, call write_saved_plan_file with:

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
