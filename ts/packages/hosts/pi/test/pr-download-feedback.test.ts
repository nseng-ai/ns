import { describe, expect, test } from "vitest";

import prExtension, {
	PR_DOWNLOAD_FEEDBACK_COMMAND_NAME,
	PR_DOWNLOAD_STACK_FEEDBACK_COMMAND_NAME,
	type ExtensionAPI,
	type ExtensionContext,
	type RegisteredCommand,
} from "../src/core/pr/extension.ts";
import type { RawPiExecResult } from "../src/kit/shared/command-exec.ts";

const ROOT = "/repo";

interface ExecCall {
	command: string;
	args: string[];
}

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly calls: ExecCall[] = [];
	readonly userMessages: string[] = [];
	private readonly fallbackResult: RawPiExecResult;
	private readonly results: RawPiExecResult[];

	constructor(
		result: RawPiExecResult | RawPiExecResult[] = execResult({
			stdout: envelope(downloadFeedbackData({ markdown: "# Prompt" })),
		}),
	) {
		this.results = Array.isArray(result) ? [...result] : [result];
		this.fallbackResult = this.results.at(-1) ?? execResult();
	}

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	on(_event: "session_start" | "agent_end" | "session_shutdown", _handler: unknown): void {}

	async exec(command: string, args: string[]): Promise<RawPiExecResult> {
		this.calls.push({ command, args });
		return this.results.shift() ?? this.fallbackResult;
	}

	sendUserMessage(content: string): void {
		this.userMessages.push(content);
	}
}

class FakeContext implements ExtensionContext {
	readonly cwd = ROOT;
	readonly hasUI: boolean;
	readonly notifications: Array<{ message: string; level: string | undefined }> = [];
	readonly statuses: Array<{ key: string; value: string | undefined }> = [];
	readonly editorTexts: string[] = [];
	readonly customCalls: Array<{ options: unknown }> = [];
	readonly ui: NonNullable<ExtensionContext["ui"]>;

	constructor(options: { hasUI?: boolean; custom?: boolean } = {}) {
		this.hasUI = options.hasUI ?? true;
		this.ui = {
			notify: (message: string, level?: "info" | "warning" | "error") => {
				this.notifications.push({ message, level });
			},
			setStatus: (key: string, value: string | undefined) => {
				this.statuses.push({ key, value });
			},
			setEditorText: (text: string) => {
				this.editorTexts.push(text);
			},
			...(options.custom === false
				? {}
				: {
						custom: async <T>(_factory: unknown, options: unknown): Promise<T> => {
							this.customCalls.push({ options });
							return undefined as T;
						},
					}),
		};
	}
}

function execResult(overrides: Partial<RawPiExecResult> = {}): RawPiExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
	};
}

function envelope(data: object): string {
	return JSON.stringify({ exitCode: 0, data });
}

function negativeEnvelope(data: object): string {
	return JSON.stringify({ status: "negative", exitCode: 1, message: "No PR found", data });
}

function counts(
	overrides: Partial<
		Record<
			| "includedReviewThreads"
			| "includedReviews"
			| "includedDiscussionComments"
			| "excludedResolvedThreads"
			| "excludedEmptyReviews"
			| "excludedAutomationComments",
			number
		>
	> = {},
): object {
	return {
		includedReviewThreads: overrides.includedReviewThreads ?? 0,
		includedReviews: overrides.includedReviews ?? 0,
		includedDiscussionComments: overrides.includedDiscussionComments ?? 0,
		excludedResolvedThreads: overrides.excludedResolvedThreads ?? 0,
		excludedEmptyReviews: overrides.excludedEmptyReviews ?? 0,
		excludedAutomationComments: overrides.excludedAutomationComments ?? 0,
	};
}

function downloadFeedbackData(
	overrides: {
		markdown?: string;
		bodyMarkdown?: string;
		found?: boolean;
		prNumber?: number | null;
		targetOverrides?: object;
		countsOverrides?: object;
	} = {},
): object {
	const bodyMarkdown = overrides.bodyMarkdown ?? overrides.markdown ?? "Report body";
	return {
		found: overrides.found ?? true,
		target: {
			kind: "github-pr",
			pr_number: overrides.prNumber ?? 123,
			title: "Download PR",
			url: "https://example.test/pull/123",
			branch: "feature-download",
			head_ref_name: "feature-download",
			base_ref_name: "main",
			...overrides.targetOverrides,
		},
		counts: overrides.countsOverrides ?? counts(),
		bodyMarkdown,
		markdown: overrides.markdown ?? ["# PR feedback report", "", bodyMarkdown].join("\n"),
	};
}

interface RunRegisteredCommandOptions {
	pi: FakePi;
	commandName: string;
	rawArgs?: string;
	ctx?: FakeContext;
}

async function runCommand(pi: FakePi, rawArgs = ""): Promise<FakeContext> {
	return await runRegisteredCommand({
		pi,
		commandName: PR_DOWNLOAD_FEEDBACK_COMMAND_NAME,
		rawArgs,
	});
}

async function runStackCommand(pi: FakePi, rawArgs = ""): Promise<FakeContext> {
	return await runRegisteredCommand({
		pi,
		commandName: PR_DOWNLOAD_STACK_FEEDBACK_COMMAND_NAME,
		rawArgs,
	});
}

async function runRegisteredCommand(options: RunRegisteredCommandOptions): Promise<FakeContext> {
	const ctx = options.ctx ?? new FakeContext();
	const rawArgs = options.rawArgs ?? "";
	prExtension(options.pi);
	const command = options.pi.commands.get(options.commandName);
	expect(command).toBeDefined();
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
		const markdown = "# PR feedback report\n\nThread 1";
		const pi = new FakePi(execResult({ stdout: envelope(downloadFeedbackData({ markdown })) }));

		const ctx = await runCommand(pi);

		expect(pi.calls).toEqual([
			{ command: "ns", args: ["address", "exec", "download-feedback", "--format", "json"] },
		]);
		expect(ctx.editorTexts).toHaveLength(1);
		expect(ctx.editorTexts[0]).toContain(markdown);
		expect(ctx.editorTexts[0]).toContain("## Addressing workflow boundary");
		expect(ctx.editorTexts[0]).toContain(
			"apply unambiguous, behavior-preserving fixes directly to this branch",
		);
		expect(ctx.editorTexts[0]).toContain(
			"Do not wait for or poll CI, Graphite mergeability, automated review jobs, or newly generated feedback",
		);
		expect(ctx.editorTexts[0]).not.toContain("disposition plan");
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
		const pi = new FakePi(
			execResult({ stdout: envelope(downloadFeedbackData({ markdown: "# Prompt" })) }),
		);

		await runCommand(pi, "123");

		expect(pi.calls).toEqual([
			{
				command: "ns",
				args: ["address", "exec", "download-feedback", "--pr-number", "123", "--format", "json"],
			},
		]);
	});

	test("prefills returned markdown for a negative no-PR envelope", async () => {
		const markdown = "# PR feedback report\n\nNo PR found.";
		const pi = new FakePi(
			execResult({
				stdout: negativeEnvelope(
					downloadFeedbackData({
						found: false,
						prNumber: null,
						markdown,
						targetOverrides: {
							title: null,
							url: null,
							head_ref_name: null,
							base_ref_name: null,
						},
					}),
				),
				code: 1,
			}),
		);

		const ctx = await runCommand(pi);

		expect(ctx.editorTexts).toHaveLength(1);
		expect(ctx.editorTexts[0]).toContain(markdown);
		expect(ctx.editorTexts[0]).toContain("## Addressing workflow boundary");
		expect(ctx.editorTexts[0]).toContain(
			"apply unambiguous, behavior-preserving fixes directly to this branch",
		);
		expect(ctx.notifications.at(-1)?.level).toBe("info");
		expect(pi.userMessages).toEqual([]);
	});

	test("nonzero empty output reports stderr and leaves editor text unchanged", async () => {
		const pi = new FakePi(execResult({ stdout: "", stderr: "extension load failed", code: 2 }));

		const ctx = await runCommand(pi);

		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "download-feedback failed: extension load failed",
			level: "error",
		});
		expect(pi.userMessages).toEqual([]);
	});

	test("malformed output reports an error and leaves editor text unchanged", async () => {
		const pi = new FakePi(execResult({ stdout: "not json", stderr: "boom", code: 2 }));

		const ctx = await runCommand(pi);

		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain(
			"Malformed ns address exec download-feedback",
		);
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
	test("discovers stack branches, downloads each PR, and pre-fills one stack report", async () => {
		const pr101BodyMarkdown =
			"## Target PR\n- PR: 101\n\n## Unresolved review threads\n\nThread 101";
		const pr101Markdown = [
			"# PR feedback report",
			"",
			pr101BodyMarkdown,
			"",
			"Single-PR report footer should not leak into stack reports.",
		].join("\n");
		const pr102BodyMarkdown = "## Target PR\n- PR: 102\n\n## Discussion comments\n\nComment 102";
		const pr102Markdown = ["# PR feedback report", "", pr102BodyMarkdown].join("\n");
		const pi = new FakePi([
			execResult({ stdout: envelope({ branches: ["branch-one", "branch-two"] }) }),
			execResult({
				stdout: envelope({
					branchPrs: [
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
				stdout: envelope(
					downloadFeedbackData({
						markdown: pr101Markdown,
						bodyMarkdown: pr101BodyMarkdown,
						prNumber: 101,
						countsOverrides: counts({ includedReviewThreads: 1, excludedResolvedThreads: 2 }),
					}),
				),
			}),
			execResult({
				stdout: envelope(
					downloadFeedbackData({
						markdown: pr102Markdown,
						bodyMarkdown: pr102BodyMarkdown,
						prNumber: 102,
						countsOverrides: counts({
							includedDiscussionComments: 3,
							includedReviews: 1,
							excludedEmptyReviews: 1,
							excludedAutomationComments: 4,
						}),
					}),
				),
			}),
		]);

		const ctx = await runStackCommand(pi);

		expect(pi.calls).toEqual([
			{
				command: "ns",
				args: ["slot", "gt", "exec", "stack-branches", "--downstack", "--format", "json"],
			},
			{
				command: "ns",
				args: [
					"address",
					"exec",
					"map-branch-prs",
					"--branches-json",
					JSON.stringify({ branches: ["branch-one", "branch-two"] }),
					"--format",
					"json",
				],
			},
			{
				command: "ns",
				args: ["address", "exec", "download-feedback", "--pr-number", "101", "--format", "json"],
			},
			{
				command: "ns",
				args: ["address", "exec", "download-feedback", "--pr-number", "102", "--format", "json"],
			},
		]);
		expect(ctx.editorTexts).toHaveLength(1);
		const report = ctx.editorTexts[0] ?? "";
		expect(report).toContain("# PR stack feedback report");
		expect(report).toContain("Downloaded PR feedback for the current Graphite downstack is below.");
		expect(report).toContain("## Stack PRs");
		expect(report).toContain("- #101 branch-one: First (https://example.test/pull/101)");
		expect(report).toContain("## Feedback by PR");
		expect(report).toContain("## PR #101: First");
		expect(report).toContain("### Target PR");
		expect(report).toContain("Thread 101");
		expect(report).toContain("Comment 102");
		expect(report.indexOf("## Summary")).toBeGreaterThan(report.indexOf("Comment 102"));
		expect(report).toContain("Downloaded feedback for 2 PRs in the current Graphite downstack.");
		expect(report).toContain(
			"Stack PRs:\n- #101 branch-one: First (https://example.test/pull/101)\n- #102 branch-two: Second (https://example.test/pull/102)",
		);
		expect(report).toContain("- Unresolved review threads included: 1");
		expect(report).toContain("- PR-level review bodies included: 1");
		expect(report).toContain("- Discussion comments included: 3");
		expect(report).toContain("- Resolved review threads excluded: 2");
		expect(report).toContain("- Empty PR-level reviews excluded: 1");
		expect(report).toContain("- Automation-like discussion comments excluded: 4");
		expect(report).not.toContain("## Instructions before responding");
		expect(report).not.toContain("classify feedback groups as AUTO, STEER, or DEFER");
		expect(report).not.toContain("ns address exec close-review-threads --thread-ids-json");
		expect(report).not.toContain("ns flow submit");
		expect(report).not.toContain("Single-PR report footer should not leak");
		expect(report).toContain("## Addressing workflow boundary");
		expect(report).toContain("Propose a disposition plan for this feedback now");
		expect(report).toContain("even if the user only submitted this report");
		expect(report).toContain("explicitly offering the option to revise it or do something else");
		expect(report).toContain("wait for explicit approval before changing anything");
		expect(report).toContain("omnibus");
		expect(report).not.toContain(
			"apply unambiguous, behavior-preserving fixes directly to this branch",
		);
		expect(report).toContain(
			"Re-download feedback only when the user explicitly requests another pass or invokes a stack-repair/checks workflow",
		);
		expect(report).toContain(
			"The `code-fix-gh-stack` workflow owns waiting, re-querying checks, and iterative repair",
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

	test("continues when the current downstack branch has no open PR", async () => {
		const pr101Markdown = "# PR feedback report\n\n## Target PR\n- PR: 101";
		const pi = new FakePi([
			execResult({ stdout: envelope({ branches: ["branch-one", "autorun-feedback"] }) }),
			execResult({
				stdout: negativeEnvelope({
					branchPrs: [
						{
							branch: "branch-one",
							pr_number: 101,
							title: "First",
							url: "https://example.test/pull/101",
							head_ref_name: "branch-one",
							base_ref_name: "main",
						},
					],
					missingBranches: ["autorun-feedback"],
					ambiguousBranches: [],
				}),
				code: 1,
			}),
			execResult({
				stdout: envelope(
					downloadFeedbackData({
						markdown: pr101Markdown,
						prNumber: 101,
						countsOverrides: counts({ includedReviewThreads: 1 }),
					}),
				),
			}),
		]);

		const ctx = await runStackCommand(pi);

		expect(pi.calls.map((call) => call.args[0])).toEqual(["slot", "address", "address"]);
		expect(ctx.editorTexts).toHaveLength(1);
		const report = ctx.editorTexts[0] ?? "";
		expect(report).toContain("- #101 branch-one: First (https://example.test/pull/101)");
		expect(report).toContain("Branches without open PRs:\n- autorun-feedback");
		expect(ctx.notifications.at(-1)).toEqual({
			message:
				"Downloaded PR stack feedback for 1 PR into the editor; skipped 1 branch without an open PR: autorun-feedback. Review/edit, then press Enter.",
			level: "info",
		});
	});

	test("reports ambiguous branch-to-PR mapping as an error", async () => {
		const pi = new FakePi([
			execResult({ stdout: envelope({ branches: ["branch-one"] }) }),
			execResult({
				stdout: negativeEnvelope({
					branchPrs: [],
					missingBranches: [],
					ambiguousBranches: [{ branch: "branch-one" }],
				}),
				code: 1,
			}),
		]);

		const ctx = await runStackCommand(pi);

		expect(pi.calls).toHaveLength(2);
		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message:
				"Cannot download stack feedback because multiple open PRs matched branches: branch-one",
			level: "error",
		});
	});

	test("reports no stack branches from a negative stack discovery envelope", async () => {
		const pi = new FakePi(execResult({ stdout: negativeEnvelope({ branches: [] }), code: 1 }));

		const ctx = await runStackCommand(pi);

		expect(pi.calls).toEqual([
			{
				command: "ns",
				args: ["slot", "gt", "exec", "stack-branches", "--downstack", "--format", "json"],
			},
		]);
		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "No Graphite downstack branches found for the current checkout.",
			level: "warning",
		});
	});

	test("reports malformed stack branch output", async () => {
		const pi = new FakePi(execResult({ stdout: "not json", stderr: "boom", code: 2 }));

		const ctx = await runStackCommand(pi);

		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("Malformed ns slot gt exec stack-branches");
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
