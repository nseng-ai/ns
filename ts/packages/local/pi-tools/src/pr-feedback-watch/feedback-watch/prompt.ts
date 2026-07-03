import type { DispatchPromptInput } from "./model.ts";

export function buildDetectedFeedbackPrompt(input: DispatchPromptInput): string {
	const data = input.data;
	const lines = [
		"Automated PR feedback watch trigger.",
		"",
		"New PR feedback arrived for the current branch's PR.",
		"",
		`PR: #${data.target.pr_number ?? "unknown"} ${data.target.title ?? "(untitled)"}`,
		`URL: ${data.target.url ?? "(unknown)"}`,
		`Branch: ${data.target.branch ?? data.target.head_ref_name ?? "(unknown)"}`,
		"Detected feedback change keys:",
	];
	for (const item of input.items) {
		const location =
			item.path === undefined
				? ""
				: ` path=${item.path}${item.line === undefined ? "" : `:${item.line}`}`;
		lines.push(`- ${item.kind}/${item.key} author=${item.author ?? "(unknown)"}${location}`);
	}
	lines.push(
		"",
		"Downloaded feedback Markdown:",
		"",
		data.markdown,
		"",
		"Instructions:",
		"- Inspect the current repository state before acting.",
		"- Automatically address straightforward feedback when it is localized, mechanically verifiable, low-risk, and does not require a product/design decision or broad refactor.",
		'- For straightforward fixes: edit the minimal files and run appropriate validation. If validation passes, you must close every addressed review thread and, when useful, reply with a concise summary using `ns address exec close-review-threads --thread-ids-json \'{"threadIds":["<THREAD_ID>"]}\' --body <BODY> --format json`; omit `--body` for resolve-only closure. Use single-thread reply/resolve primitives only for one-offs, and do not use raw `gh api graphql`.',
		"- If an addressed thread cannot be resolved or replied to after validation, report that failure in the final summary instead of silently leaving it open.",
		"- Do not push, submit, create branches, or mutate unrelated GitHub state unless the human explicitly asks.",
		"- Ask before cross-cutting, complex, ambiguous, human-authored, or dirty-tree work.",
		"- After all automatic actions complete, summarize completed fixes, validation, GitHub thread actions, and present remaining feedback for human curation.",
	);
	return lines.join("\n");
}
