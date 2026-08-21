Plan audience and context contract:

- Treat the saved Markdown plan as the only planning context available to a completely fresh downstream implementation session.
- Make the plan self-contained. Do not rely on this conversation, hidden context, tool transcripts, or "as discussed" references.
- Embed all relevant context discovered during planning, including user goals, constraints, current behavior, important files/symbols/tests/docs, decisions made, rationale, rejected alternatives, assumptions, risks, and proportional validation guidance.
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
- Validation guidance and expected results. Do not over-specify routine test/check scope as a planning decision; leave ordinary validation coverage to the implementing agent's project policy and changed-file judgment.
- Risks, assumptions, edge cases, and open questions.

Workflow:

1. Inspect the repository, documentation, and current conversation context as needed.
2. Produce and review the final Markdown plan.
3. Write the complete plan to a temporary Markdown file with Pi's built-in write tool.
4. Run `enriched-plan exec save --file <temporary-path> --format json` as a standalone bash command. Do not chain, redirect, or wrap it. Do not generate or pass a slug.
5. On success, remove the temporary file, report the returned saved-plan evidence, and stop. On collision or derivation failure, preserve the temporary file and report the failure.
6. Do not create a branch or write Branch Memory.

Local plan store contract:

- Path: `$XDG_STATE_HOME/ns/enriched-plan/<repo>/<encoded-source-branch>/<slug>.md` (default `$HOME/.local/state/ns/enriched-plan/...`).
- The command derives the semantic 3–7 word kebab-case slug from final plan content using configured model policy.
- The command validates repository and named source branch, creates private parent directories, and refuses to overwrite an existing file.
- JSON output is authoritative and includes file/repository/branch evidence plus slug provider/model and optional summary.
