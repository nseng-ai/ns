import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { buildCuratedRunnerSubagentContext } from "../src/runner-subagent/curated-context.ts";

function tempRepo(): string {
	const root = mkdtempSync(join(tmpdir(), "runner-subagent-context-"));
	mkdirSync(join(root, "src"), { recursive: true });
	return root;
}

describe("runner subagent curated context", () => {
	test("renders manifest-first context with task focus, repo facts, included sources, parent digest, and omissions", () => {
		const cwd = tempRepo();
		writeFileSync(join(cwd, "src", "example.ts"), "export function example(): string {\n\treturn 'ok';\n}\n", "utf8");

		const context = buildCuratedRunnerSubagentContext({
			title: "Inspect src/example.ts",
			prompt: "Use `src/example.ts`, mention missing `missing.ts`, and ignore `/tmp/outside-secret.txt`.",
			cwd,
			sessionEntries: [
				{ type: "message", message: { role: "user", content: "Earlier we discussed src/example.ts for the runner context." } },
				{
					type: "message",
					message: { role: "assistant", content: [{ type: "text", text: "Summary: src/example.ts should stay concise." }] },
				},
			],
		});

		expect(context.markdown.startsWith("## Auto-curated context")).toBe(true);
		expect(context.markdown).toContain("Treat it as orientation, not ground truth");
		expect(context.markdown).toContain("### Task focus");
		expect(context.markdown).toContain("### Repo/worktree facts");
		expect(context.markdown).toContain("### Included sources");
		expect(context.markdown).toContain("#### `src/example.ts`");
		expect(context.markdown).toContain("export function example");
		expect(context.markdown).toContain("### Parent-session digest");
		expect(context.markdown).toContain("src/example.ts should stay concise");
		expect(context.markdown).toContain("Unreadable `missing.ts`");
		expect(context.markdown).toContain("Omitted `/tmp/outside-secret.txt`");
		expect(context.audit.enabled).toBe(true);
		expect(context.audit.includedPaths).toEqual(["src/example.ts"]);
		expect(context.audit.unreadablePaths).toContain("missing.ts");
		expect(context.audit.omittedPaths).toContain("/tmp/outside-secret.txt");
		expect(context.audit.markdownChars).toBe(context.markdown.length);
	});

	test("omits symlinks that resolve outside cwd", () => {
		const cwd = tempRepo();
		const outside = mkdtempSync(join(tmpdir(), "runner-subagent-context-outside-"));
		writeFileSync(join(outside, "secret.txt"), "outside secret should not be read", "utf8");
		symlinkSync(join(outside, "secret.txt"), join(cwd, "link.txt"));

		const context = buildCuratedRunnerSubagentContext({
			title: "Read link.txt",
			prompt: "Inspect `link.txt`.",
			cwd,
		});

		expect(context.audit.includedPaths).toEqual([]);
		expect(context.audit.omittedPaths).toContain("link.txt");
		expect(context.markdown).toContain("Omitted `link.txt` (outside-cwd)");
		expect(context.markdown).not.toContain("outside secret should not be read");
	});

	test("truncates large readable file excerpts and marks the audit", () => {
		const cwd = tempRepo();
		writeFileSync(join(cwd, "large.txt"), `${"a".repeat(8_000)}UNIQUE_TAIL`, "utf8");

		const context = buildCuratedRunnerSubagentContext({
			title: "Read large.txt",
			prompt: "Inspect `large.txt`.",
			cwd,
		});

		expect(context.audit.includedPaths).toEqual(["large.txt"]);
		expect(context.audit.isTruncated).toBe(true);
		expect(context.markdown).toContain("Excerpt characters:");
		expect(context.markdown).toContain("(truncated)");
		expect(context.markdown).not.toContain("UNIQUE_TAIL");
	});

	test("continues when git and session manager evidence are unavailable", () => {
		const cwd = join(tmpdir(), "runner-subagent-context-missing-cwd");
		const context = buildCuratedRunnerSubagentContext({ title: "No repo", prompt: "Classify this task.", cwd });

		expect(context.audit.isGitAvailable).toBe(false);
		expect(context.markdown).toContain("Git evidence unavailable");
		expect(context.markdown).toContain("No parent-session entries were available");
		expect(context.markdown).toContain("No readable mentioned or changed source files were included");
	});
});
