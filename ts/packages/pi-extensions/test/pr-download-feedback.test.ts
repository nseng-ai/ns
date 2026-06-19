import { describe, expect, test } from "vitest";

import prExtension, {
	PR_DOWNLOAD_FEEDBACK_COMMAND_NAME,
	PR_DOWNLOAD_STACK_FEEDBACK_COMMAND_NAME,
	type ExtensionAPI,
	type ExtensionContext,
	type ExecResult,
	type RegisteredCommand,
} from "../src/pr.ts";

const ROOT = "/repo";

interface ExecCall {
	command: string;
	args: string[];
}

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly calls: ExecCall[] = [];
	readonly userMessages: string[] = [];
	private readonly fallbackResult: ExecResult;
	private readonly results: ExecResult[];

	constructor(
		result: ExecResult | ExecResult[] = execResult({ stdout: envelope({ markdown: "# Prompt" }) }),
	) {
		this.results = Array.isArray(result) ? [...result] : [result];
		this.fallbackResult = this.results.at(-1) ?? execResult();
	}

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	async exec(command: string, args: string[]): Promise<ExecResult> {
		this.calls.push({ command, args });
		return this.results.shift() ?? this.fallbackResult;
	}

	sendUserMessage(content: string): void {
		this.userMessages.push(content);
	}
}

class FakeContext implements ExtensionContext {
	readonly cwd = ROOT;
	readonly hasUI = true;
	readonly notifications: Array<{ message: string; level: string | undefined }> = [];
	readonly statuses: Array<{ key: string; value: string | undefined }> = [];
	readonly editorTexts: string[] = [];
	readonly ui = {
		notify: (message: string, level?: "info" | "warning" | "error") => {
			this.notifications.push({ message, level });
		},
		setStatus: (key: string, value: string | undefined) => {
			this.statuses.push({ key, value });
		},
		setEditorText: (text: string) => {
			this.editorTexts.push(text);
		},
	};
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

function envelope(data: object): string {
	return JSON.stringify({ exit_code: 0, data });
}

function negativeEnvelope(data: object): string {
	return JSON.stringify({ exit_code: 1, message: "No PR found", data });
}

function counts(
	overrides: Partial<
		Record<
			| "included_review_threads"
			| "included_reviews"
			| "included_discussion_comments"
			| "excluded_resolved_threads"
			| "excluded_empty_reviews"
			| "excluded_automation_comments",
			number
		>
	> = {},
): object {
	return {
		included_review_threads: overrides.included_review_threads ?? 0,
		included_reviews: overrides.included_reviews ?? 0,
		included_discussion_comments: overrides.included_discussion_comments ?? 0,
		excluded_resolved_threads: overrides.excluded_resolved_threads ?? 0,
		excluded_empty_reviews: overrides.excluded_empty_reviews ?? 0,
		excluded_automation_comments: overrides.excluded_automation_comments ?? 0,
	};
}

async function runCommand(pi: FakePi, rawArgs = ""): Promise<FakeContext> {
	return await runRegisteredCommand(pi, PR_DOWNLOAD_FEEDBACK_COMMAND_NAME, rawArgs);
}

async function runStackCommand(pi: FakePi, rawArgs = ""): Promise<FakeContext> {
	return await runRegisteredCommand(pi, PR_DOWNLOAD_STACK_FEEDBACK_COMMAND_NAME, rawArgs);
}

async function runRegisteredCommand(
	pi: FakePi,
	commandName: string,
	rawArgs: string,
): Promise<FakeContext> {
	prExtension(pi);
	const command = pi.commands.get(commandName);
	expect(command).toBeDefined();
	const ctx = new FakeContext();
	await command?.handler(rawArgs, ctx);
	return ctx;
}

describe("/pr:download-feedback", () => {
	test("registers the commands", () => {
		const pi = new FakePi();

		prExtension(pi);

		expect([...pi.commands.keys()]).toEqual([
			PR_DOWNLOAD_FEEDBACK_COMMAND_NAME,
			PR_DOWNLOAD_STACK_FEEDBACK_COMMAND_NAME,
		]);
	});

	test("downloads feedback and pre-fills the editor without sending a user message", async () => {
		const markdown = "# PR feedback triage request\n\nDo not edit files yet.";
		const pi = new FakePi(execResult({ stdout: envelope({ markdown }) }));

		const ctx = await runCommand(pi);

		expect(pi.calls).toEqual([
			{ command: "pr-address", args: ["exec", "download-feedback", "--format", "json"] },
		]);
		expect(ctx.editorTexts).toEqual([markdown]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "Downloaded PR feedback into the editor. Review/edit, then press Enter.",
			level: "info",
		});
		expect(ctx.statuses).toEqual([
			{ key: PR_DOWNLOAD_FEEDBACK_COMMAND_NAME, value: "PR feedback: downloading…" },
			{ key: PR_DOWNLOAD_FEEDBACK_COMMAND_NAME, value: undefined },
		]);
		expect(pi.userMessages).toEqual([]);
	});

	test("forwards a numeric argument as --pr-number", async () => {
		const pi = new FakePi(execResult({ stdout: envelope({ markdown: "# Prompt" }) }));

		await runCommand(pi, "123");

		expect(pi.calls).toEqual([
			{
				command: "pr-address",
				args: ["exec", "download-feedback", "--pr-number", "123", "--format", "json"],
			},
		]);
	});

	test("prefills returned markdown for a negative no-PR envelope", async () => {
		const markdown = "# PR feedback triage request\n\nNo PR found.";
		const pi = new FakePi(execResult({ stdout: negativeEnvelope({ markdown }), code: 1 }));

		const ctx = await runCommand(pi);

		expect(ctx.editorTexts).toEqual([markdown]);
		expect(ctx.notifications.at(-1)?.level).toBe("info");
		expect(pi.userMessages).toEqual([]);
	});

	test("malformed output reports an error and leaves editor text unchanged", async () => {
		const pi = new FakePi(execResult({ stdout: "not json", stderr: "boom", code: 2 }));

		const ctx = await runCommand(pi);

		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("Malformed pr-address download-feedback");
		expect(pi.userMessages).toEqual([]);
	});

	test("rejects unsupported arguments without running the CLI", async () => {
		const pi = new FakePi();

		const ctx = await runCommand(pi, "--bad");

		expect(pi.calls).toEqual([]);
		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.notifications).toEqual([
			{ message: "Usage: /pr:download-feedback [pr-number]", level: "error" },
		]);
	});
});

describe("/pr:download-stack-feedback", () => {
	test("discovers stack branches, downloads each PR, and pre-fills one stack prompt", async () => {
		const pr101Markdown =
			"# PR feedback triage request\n\n## Target PR\n- PR: 101\n\n## Unresolved review threads\n\nThread 101";
		const pr102Markdown =
			"# PR feedback triage request\n\n## Target PR\n- PR: 102\n\n## Discussion comments\n\nComment 102";
		const pi = new FakePi([
			execResult({ stdout: envelope({ branches: ["branch-one", "branch-two"] }) }),
			execResult({
				stdout: envelope({
					branch_prs: [
						{
							branch: "branch-one",
							pr_number: 101,
							title: "First",
							url: "https://example.test/pull/101",
							head_ref_name: "branch-one",
							base_ref_name: "main",
						},
						{
							branch: "branch-two",
							pr_number: 102,
							title: "Second",
							url: "https://example.test/pull/102",
							head_ref_name: "branch-two",
							base_ref_name: "branch-one",
						},
					],
				}),
			}),
			execResult({
				stdout: envelope({
					markdown: pr101Markdown,
					counts: counts({ included_review_threads: 1, excluded_resolved_threads: 2 }),
				}),
			}),
			execResult({
				stdout: envelope({
					markdown: pr102Markdown,
					counts: counts({
						included_discussion_comments: 3,
						included_reviews: 1,
						excluded_empty_reviews: 1,
						excluded_automation_comments: 4,
					}),
				}),
			}),
		]);

		const ctx = await runStackCommand(pi);

		expect(pi.calls).toEqual([
			{ command: "slot", args: ["gt", "exec", "stack-branches", "--format", "json"] },
			{
				command: "pr-address",
				args: [
					"exec",
					"map-branch-prs",
					"--branches-json",
					JSON.stringify({ branches: ["branch-one", "branch-two"] }),
					"--format",
					"json",
				],
			},
			{
				command: "pr-address",
				args: ["exec", "download-feedback", "--pr-number", "101", "--format", "json"],
			},
			{
				command: "pr-address",
				args: ["exec", "download-feedback", "--pr-number", "102", "--format", "json"],
			},
		]);
		expect(ctx.editorTexts).toHaveLength(1);
		const prompt = ctx.editorTexts[0] ?? "";
		expect(prompt).toContain("# PR stack feedback triage request");
		expect(prompt).toContain(
			"Downloaded PR feedback for the current Graphite stack is below. Review the summary and instructions at the bottom before responding.",
		);
		expect(prompt).toContain("## Stack PRs");
		expect(prompt).toContain("- #101 branch-one: First (https://example.test/pull/101)");
		expect(prompt).toContain("## Feedback by PR");
		expect(prompt).toContain("## PR #101: First");
		expect(prompt).toContain("### Target PR");
		expect(prompt).toContain("Thread 101");
		expect(prompt).toContain("Comment 102");
		expect(prompt.indexOf("## Summary")).toBeGreaterThan(prompt.indexOf("Comment 102"));
		expect(prompt).toContain("Downloaded feedback for 2 PRs in the current Graphite stack.");
		expect(prompt).toContain(
			"Stack PRs:\n- #101 branch-one: First (https://example.test/pull/101)\n- #102 branch-two: Second (https://example.test/pull/102)",
		);
		expect(prompt).toContain("- Unresolved review threads included: 1");
		expect(prompt).toContain("- PR-level review bodies included: 1");
		expect(prompt).toContain("- Discussion comments included: 3");
		expect(prompt).toContain("- Resolved review threads excluded: 2");
		expect(prompt).toContain("- Empty PR-level reviews excluded: 1");
		expect(prompt).toContain("- Automation-like discussion comments excluded: 4");
		expect(prompt.indexOf("## Instructions before responding")).toBeGreaterThan(
			prompt.indexOf("## Summary"),
		);
		expect(prompt).toContain("shared fixes, per-PR fixes, ordering constraints");
		expect(prompt).toContain("Default stack feedback policies:");
		expect(prompt).toContain("single omnibus follow-up PR at the current stack tip");
		expect(prompt).toContain(
			"Plan against the current remaining state, not stale original comments",
		);
		expect(prompt).toContain("Treat automation feedback as stack-level remediation");
		expect(prompt).toContain("resolve all automation review threads stack-wide");
		expect(prompt.trim()).toMatch(
			/Do not edit files yet; propose a plan and wait for human confirmation\. Do not resolve or reply to GitHub threads during this initial triage prompt; .*validation has passed\.$/u,
		);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "Downloaded PR stack feedback into the editor. Review/edit, then press Enter.",
			level: "info",
		});
		expect(ctx.statuses.at(0)).toEqual({
			key: PR_DOWNLOAD_STACK_FEEDBACK_COMMAND_NAME,
			value: "PR stack feedback: discovering stack…",
		});
		expect(ctx.statuses.at(-1)).toEqual({
			key: PR_DOWNLOAD_STACK_FEEDBACK_COMMAND_NAME,
			value: undefined,
		});
		expect(pi.userMessages).toEqual([]);
	});

	test("reports no stack branches from a negative stack discovery envelope", async () => {
		const pi = new FakePi(execResult({ stdout: negativeEnvelope({ branches: [] }), code: 1 }));

		const ctx = await runStackCommand(pi);

		expect(pi.calls).toEqual([
			{ command: "slot", args: ["gt", "exec", "stack-branches", "--format", "json"] },
		]);
		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "No Graphite stack branches found for the current checkout.",
			level: "warning",
		});
	});

	test("reports malformed stack branch output", async () => {
		const pi = new FakePi(execResult({ stdout: "not json", stderr: "boom", code: 2 }));

		const ctx = await runStackCommand(pi);

		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("Malformed slot gt exec stack-branches");
		expect(ctx.notifications.at(-1)?.message).toContain("boom");
	});

	test("rejects arguments without running the CLI", async () => {
		const pi = new FakePi();

		const ctx = await runStackCommand(pi, "123");

		expect(pi.calls).toEqual([]);
		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.notifications).toEqual([
			{ message: "Usage: /pr:download-stack-feedback", level: "error" },
		]);
	});
});
