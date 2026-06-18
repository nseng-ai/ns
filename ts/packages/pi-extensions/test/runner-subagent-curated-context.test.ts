import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import type { ExecResult } from "@asdl/core/exec";

import {
	buildCuratedRunnerSubagentContext,
	type CuratedContextExecGit,
} from "../src/runner-subagent/curated-context.ts";

function tempRepo(): string {
	const root = mkdtempSync(join(tmpdir(), "runner-subagent-context-"));
	mkdirSync(join(root, "src"), { recursive: true });
	return root;
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return { stdout: "", stderr: "", code: 0, killed: false, ...overrides };
}

function gitUnavailable(): CuratedContextExecGit {
	return () => Promise.resolve(execResult({ code: 127, startupError: "git unavailable" }));
}

function scriptedGit(
	options: { status?: string | ExecResult; diffStat?: string | ExecResult } = {},
): CuratedContextExecGit {
	return (args) => {
		const command = args.join(" ");
		if (command === "status --short") return Promise.resolve(scriptedResult(options.status));
		if (command === "diff --stat") return Promise.resolve(scriptedResult(options.diffStat));
		return Promise.resolve(execResult({ code: 1, stderr: `unexpected git command: ${command}` }));
	};
}

function scriptedResult(value: string | ExecResult | undefined): ExecResult {
	if (typeof value === "string") return execResult({ stdout: value });
	return value ?? execResult();
}

describe("runner subagent curated context", () => {
	test("renders manifest-first context with task focus, repo facts, included sources, and omissions", async () => {
		const cwd = tempRepo();
		writeFileSync(
			join(cwd, "src", "example.ts"),
			"export function example(): string {\n\treturn 'ok';\n}\n",
			"utf8",
		);

		const context = await buildCuratedRunnerSubagentContext({
			title: "Inspect src/example.ts",
			prompt:
				"Use `src/example.ts`, mention missing `missing.ts`, and ignore `/tmp/outside-secret.txt`.",
			cwd,
			execGit: scriptedGit(),
		});

		expect(context.markdown.startsWith("## Auto-curated context")).toBe(true);
		expect(context.markdown).toContain("Treat it as orientation, not ground truth");
		expect(context.markdown).toContain("### Task focus");
		expect(context.markdown).toContain("### Repo/worktree facts");
		expect(context.markdown).toContain("### Included sources");
		expect(context.markdown).toContain("#### `src/example.ts`");
		expect(context.markdown).toContain("export function example");
		expect(context.markdown).not.toContain("Unreadable `missing.ts`");
		expect(context.markdown).toContain("Omitted `/tmp/outside-secret.txt`");
		expect(context.audit.includedPaths).toEqual(["src/example.ts"]);
		expect(context.audit.unreadablePaths).toContain("missing.ts");
		expect(context.audit.omittedPaths).toContain("/tmp/outside-secret.txt");
		expect(context.audit.markdownChars).toBe(context.markdown.length);
	});

	test("omits symlinks that resolve outside cwd", async () => {
		const cwd = tempRepo();
		const outside = mkdtempSync(join(tmpdir(), "runner-subagent-context-outside-"));
		writeFileSync(join(outside, "secret.txt"), "outside secret should not be read", "utf8");
		symlinkSync(join(outside, "secret.txt"), join(cwd, "link.txt"));

		const context = await buildCuratedRunnerSubagentContext({
			title: "Read link.txt",
			prompt: "Inspect `link.txt`.",
			cwd,
			execGit: scriptedGit(),
		});

		expect(context.audit.includedPaths).toEqual([]);
		expect(context.audit.omittedPaths).toContain("link.txt");
		expect(context.markdown).toContain("Omitted `link.txt` (outside-cwd)");
		expect(context.markdown).not.toContain("outside secret should not be read");
	});

	test("truncates large readable file excerpts and marks the audit", async () => {
		const cwd = tempRepo();
		writeFileSync(join(cwd, "large.txt"), `${"a".repeat(8_000)}UNIQUE_TAIL`, "utf8");

		const context = await buildCuratedRunnerSubagentContext({
			title: "Read large.txt",
			prompt: "Inspect `large.txt`.",
			cwd,
			execGit: scriptedGit(),
		});

		expect(context.audit.includedPaths).toEqual(["large.txt"]);
		expect(context.audit.isTruncated).toBe(true);
		expect(context.markdown).toContain("Excerpt characters:");
		expect(context.markdown).toContain("(truncated)");
		expect(context.markdown).not.toContain("UNIQUE_TAIL");
	});

	test("continues when git evidence is unavailable", async () => {
		const cwd = join(tmpdir(), "runner-subagent-context-missing-cwd");
		const context = await buildCuratedRunnerSubagentContext({
			title: "No repo",
			prompt: "Classify this task.",
			cwd,
			execGit: gitUnavailable(),
		});

		expect(context.audit.isGitAvailable).toBe(false);
		expect(context.markdown).toContain("Git evidence unavailable");
		expect(context.markdown).not.toContain("### Included sources");
		expect(context.markdown).not.toContain("### Omitted or unreadable candidates");
	});

	test("ignores prose path-like false positives and includes only backticked real files", async () => {
		const cwd = tempRepo();
		writeFileSync(join(cwd, "src", "real.ts"), "export const real = true;\n", "utf8");

		const proseOnly = await buildCuratedRunnerSubagentContext({
			title: "Check prose",
			prompt: "Examples like e.g., v2.4.1, Node.js, 22.3, and src/real.ts are prose here.",
			cwd,
			execGit: scriptedGit(),
		});

		expect(proseOnly.audit.includedPaths).toEqual([]);
		expect(proseOnly.audit.unreadablePaths).toEqual([]);
		expect(proseOnly.audit.omittedPaths).toEqual([]);
		expect(proseOnly.markdown).not.toContain("Unreadable");
		expect(proseOnly.markdown).not.toContain("Omitted");

		const backticked = await buildCuratedRunnerSubagentContext({
			title: "Check `src/real.ts`",
			prompt: "Read `src/real.ts`.",
			cwd,
			execGit: scriptedGit(),
		});

		expect(backticked.audit.includedPaths).toEqual(["src/real.ts"]);
		expect(backticked.markdown).toContain("export const real = true");
	});

	test("bounds huge git status output while rendering truncated git evidence", async () => {
		const cwd = tempRepo();
		const statusLines: string[] = [];
		for (let index = 0; index < 80; index += 1) {
			const path = `src/file-${index.toString().padStart(2, "0")}-${"x".repeat(120)}.ts`;
			statusLines.push(` M ${path}`);
			if (index < 30)
				writeFileSync(join(cwd, path), `export const value${index} = ${index};\n`, "utf8");
		}

		const context = await buildCuratedRunnerSubagentContext({
			title: "Summarize changes",
			prompt: "Use changed files.",
			cwd,
			execGit: scriptedGit({ status: statusLines.join("\n"), diffStat: "large diff stat" }),
		});

		expect(context.audit.isGitAvailable).toBe(true);
		expect(context.markdown).toContain("[truncated");
		expect(context.audit.includedPaths).toHaveLength(6);
		expect(context.audit.omittedPaths.length).toBeGreaterThan(0);
		expect(context.audit.omittedPaths.length).toBeLessThanOrEqual(24);
		expect(
			context.audit.omittedPaths.length +
				context.audit.includedPaths.length +
				context.audit.unreadablePaths.length,
		).toBeLessThanOrEqual(30);
		expect(context.markdown).toContain("Omitted ");
		expect(context.markdown).toContain("candidate(s)");
	});
});
