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

Exact save procedure:

1. Inspect the repository, documentation, and current conversation context as needed for the requested work.
2. Produce detailed, self-contained final Markdown and review the exact final content for completeness.
3. Run exactly `mktemp "${TMPDIR:-/tmp}/ns-saved-plan.XXXXXX"` and retain the exact path returned by `mktemp`.
4. Use the generic write tool to write the exact final Markdown content to that returned path. Do not transform, summarize, or reconstruct the content through shell interpolation.
5. Safely shell-quote the exact path and invoke `enriched-plan exec save --content-file '<exact path>' --format json`.
6. Treat the save as successful only when the command exits zero and stdout parses as a Clinkr success envelope with `status: "ok"` and complete saved-plan evidence in its `data` object: `format`, `slug`, `filePath`, `fileName`, `fileStem`, `timestamp`, `timestampNumber`, `sequence`, `repoRoot`, `repoKey`, `repoIdentitySource`, `sourceBranch`, `branchKey`, and `directoryPath`.
7. Only after successful save evidence, run `rm -- '<exact path>'` for that exact temporary path. If cleanup fails, warn about cleanup and report the retained path, but do not invalidate the successful save.
8. If any step before confirmed save success fails, do not remove the temporary file. Retain and report its exact path, report the command exit and parse/failure evidence, and stop. If `mktemp` failed before returning a path, report that no temporary path was allocated.
9. Report the complete parsed saved-plan evidence and stop. Do not create Branch Context, start implementation, or write Branch Memory.

Local plan store contract:

- The `enriched-plan exec save` command derives the timestamped filename slug, repository identity, source branch, and destination in the XDG local plan store from the final content and current repository.
- The temporary file is only transport for exact plan bytes. It is not the Saved Plan and must not be used as implementation input after a successful save.
- Working-tree behavior: no checked-in plan file is created.
