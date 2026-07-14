import { describe, expect, test } from "vitest";

import type { RawPiExecResult } from "@nseng-ai/pi/shared/command-exec";

import prPreviewsExtension, {
	PR_PREVIEW_CHECKS_COMMAND_NAME,
	PR_PREVIEW_FEEDBACK_COMMAND_NAME,
	type ExtensionAPI,
	type ExtensionContext,
	type RegisteredCommand,
} from "../../src/pr-previews/extension.ts";
import {
	buildThreadDetailLines,
	buildThreadRowLabel,
	type PrPreviewFeedbackThread,
} from "../../src/pr-previews/preview-feedback-model.ts";
import { buildCountMismatchNotice } from "../../src/pr-previews/preview-feedback-view.ts";
import { missingPreviewTargetMessage } from "../../src/pr-previews/preview-view-utilities.ts";
import { sliceWrappedDetailLinesForViewport } from "@nseng-ai/pi/terminal/overlay";

const ROOT = "/repo";

describe("PR preview missing target messages", () => {
	test("preserves per-command locator precedence and fallback wording", () => {
		const target = { pr_number: 123, branch: "feature-preview" };

		expect(missingPreviewTargetMessage(target, { preferredLocator: "branch" })).toBe(
			"No open PR found for branch feature-preview.",
		);
		expect(missingPreviewTargetMessage(target, { preferredLocator: "pr_number" })).toBe(
			"No PR found for PR 123.",
		);
		expect(
			missingPreviewTargetMessage(
				{ pr_number: null, branch: null },
				{ preferredLocator: "branch" },
			),
		).toBe("No open PR found for current branch.");
		expect(
			missingPreviewTargetMessage(
				{ pr_number: null, branch: null },
				{ preferredLocator: "pr_number" },
			),
		).toBe("No open PR found for the current branch.");
	});
});

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
			stdout: envelope(previewDownloadData()),
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
	readonly ui: ExtensionContext["ui"];

	constructor(options: { hasUI?: boolean; custom?: boolean } = {}) {
		this.hasUI = options.hasUI ?? true;
		this.ui = {
			notify: (message: string, level?: "info" | "warning" | "error") => {
				this.notifications.push({ message, level });
			},
			setStatus: (key: string, value: string | undefined) => {
				this.statuses.push({ key, value });
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

	async waitForIdle(): Promise<void> {}
}

interface RawResultOverrides {
	readonly stdout?: string;
	readonly stderr?: string;
	readonly code?: number;
}

function execResult(overrides: RawResultOverrides = {}): RawPiExecResult {
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

function previewDownloadData(overrides: { prNumber?: number; counts?: object } = {}): object {
	return {
		found: true,
		target: {
			pr_number: overrides.prNumber ?? 123,
			title: "Preview PR",
			url: "https://example.test/pull/123",
			branch: "feature-preview",
			head_ref_name: "feature-preview",
			base_ref_name: "main",
		},
		counts: overrides.counts ?? counts({ includedReviewThreads: 1 }),
	};
}

function previewChecksData(prNumber: number, branch: string, checkName = "typescript"): object {
	return {
		found: true,
		target: {
			pr_number: prNumber,
			title: `PR ${prNumber}`,
			url: `https://example.test/pull/${prNumber}`,
			branch,
			head_ref_name: branch,
			base_ref_name: "main",
			head_ref_oid: null,
		},
		counts: { passing: 0, pending: 0, failing: 1, unknown: 0, hasMore: false },
		checks: [
			{
				bucket: "failing",
				kind: "check_run",
				name: checkName,
				workflow_name: "ci",
				status: "COMPLETED",
				conclusion: "FAILURE",
				state: null,
				started_at: null,
				completed_at: null,
				created_at: null,
				details_url: null,
				target_url: null,
				identity: `check-run:ci:${checkName}`,
			},
		],
	};
}

function stackBranchesData(branches: readonly string[]): object {
	return {
		branches,
		current: branches.at(-1) ?? "main",
	};
}

type BranchPrChecksEntryFixture =
	| { branch: string; status: "missing" | "ambiguous" }
	| { branch: string; status?: "found"; prNumber: number; checkName?: string };

function branchPrChecksData(entries: readonly BranchPrChecksEntryFixture[]): object {
	return {
		entries: entries.map((entry) => {
			if (!("prNumber" in entry)) {
				return { branch: entry.branch, status: entry.status };
			}
			const checks = previewChecksData(
				entry.prNumber,
				entry.branch,
				entry.checkName ?? "typescript",
			) as {
				target: object;
				counts: object;
				checks: object[];
			};
			return {
				branch: entry.branch,
				status: "found",
				target: checks.target,
				counts: checks.counts,
				checks: checks.checks,
			};
		}),
		summary: {
			requested: entries.length,
			matched: entries.filter((entry) => "prNumber" in entry).length,
			missing: entries.filter((entry) => entry.status === "missing").length,
			ambiguous: entries.filter((entry) => entry.status === "ambiguous").length,
		},
	};
}

function previewThreadsData(threadCount = 1): object {
	return {
		reviewThreads: Array.from({ length: threadCount }, (_unused, index) => ({
			id: `thread-${index + 1}`,
			path: "src/file.ts",
			line: 10 + index,
			start_line: null,
			is_resolved: false,
			is_outdated: false,
			comments: [
				{
					id: 900 + index,
					body: "Please fix this.",
					author: "reviewer",
					path: "src/file.ts",
					line: 10 + index,
					start_line: null,
					created_at: "2026-06-20T00:00:00Z",
				},
			],
		})),
	};
}

const CURRENT_PR_1952_REVIEW_THREADS = [
	currentPr1952Thread({
		id: "PRRT_kwDOR4YhMs6LDqVa",
		line: 304,
		commentId: 3447739320,
		body: `<!-- reviews-inline:duplicative-abstractions:05b6661786cbf1fd -->
**info: fitToWidth utility duplicated from context-profiler/render.ts**
_Review: \`duplicative-abstractions\`._

The new fitToWidth(value: string, width: number) function (line 304) duplicates the implementation already exported from context-profiler/render.ts. Both truncate-then-pad text to a fixed width using truncateToWidth and visibleWidth from pi-tui. The new version adds a width <= 0 guard but is otherwise equivalent. Siblings in the codebase import fitToWidth from context-profiler/render.ts — should the new PrPreviewFeedbackView route through that shared export instead of hand-rolling?
Evidence: \`ts/packages/internal/pi-tools/src/context-profiler/render.ts\`

_Posted by reviews. Re-running may skip this comment by marker._`,
	}),
	currentPr1952Thread({
		id: "PRRT_kwDOR4YhMs6LDqVc",
		line: 316,
		commentId: 3447739323,
		body: `<!-- reviews-inline:duplicative-abstractions:a1ffb2403abc2be8 -->
**info: clamp utility duplicated from context-profiler/render.ts**
_Review: \`duplicative-abstractions\`._

The new clamp(value: number, min: number, max: number) function (line 316) duplicates the clamping utility already exported from context-profiler/render.ts. The implementations are nearly identical; context-profiler's version adds a guard for max < min. Since clamp is a common operation, siblings like context-profiler/view.ts import the shared export — should this new code import from there instead of defining locally?
Evidence: \`ts/packages/internal/pi-tools/src/context-profiler/render.ts\`

_Posted by reviews. Re-running may skip this comment by marker._`,
	}),
	currentPr1952Thread({
		id: "PRRT_kwDOR4YhMs6LDqVd",
		line: 310,
		commentId: 3447739324,
		body: `<!-- reviews-inline:duplicative-abstractions:b94684670e00730d -->
**info: reconcileScroll algorithm overlaps with context-profiler but may diverge**
_Review: \`duplicative-abstractions\`._

The new reconcileScroll(selection: number, scroll: number, height: number) function (line 310) keeps a selection visible within a scrollable viewport. Context-profiler exports a reconcileScroll with a different signature (takes options object with scroll, anchor, areaHeight, totalLines) that enforces anchoring semantics. Both solve scroll-state reconciliation but with different contracts. The simpler new algorithm may be sufficient for the preview use-case, but a follow-up agent should verify whether one implementation should be canonical or if they serve genuinely different purposes.
Evidence: \`ts/packages/internal/pi-tools/src/context-profiler/render.ts\`

_Posted by reviews. Re-running may skip this comment by marker._`,
	}),
	currentPr1952Thread({
		id: "PRRT_kwDOR4YhMs6LDqbW",
		line: 183,
		commentId: 3447739828,
		createdAt: "2026-06-21T01:09:29Z",
		body: `<!-- reviews-inline:ns-typescript-style:a2446bd16426bc13 -->
**warning: Function with 4+ positional parameters**
_Review: \`ns-typescript-style\`._

The \`border\` method declares 4 required positional parameters (left, fill, right, width). Rule 12 (Long positional parameter lists) recommends using a named \`*Options\` object for functions with four or more positional parameters, rather than separate positional parameters.

_Posted by reviews. Re-running may skip this comment by marker._`,
	}),
] as const satisfies readonly PrPreviewFeedbackThread[];

function currentPr1952Thread(options: {
	id: string;
	line: number;
	commentId: number;
	body: string;
	createdAt?: string;
}): PrPreviewFeedbackThread {
	const path = "ts/packages/internal/pi-tools/src/pr-previews/preview-feedback-view.ts";
	return {
		id: options.id,
		path,
		line: options.line,
		start_line: options.line,
		is_resolved: false,
		is_outdated: false,
		comments: [
			{
				id: options.commentId,
				body: options.body,
				author: "github-actions",
				path,
				line: options.line,
				start_line: null,
				created_at: options.createdAt ?? "2026-06-21T01:08:49Z",
			},
		],
	};
}

interface RunRegisteredCommandOptions {
	pi: FakePi;
	commandName: string;
	rawArgs?: string;
	ctx?: FakeContext;
}

interface RunPreviewCommandOptions {
	pi: FakePi;
	rawArgs?: string;
	ctx?: FakeContext;
}

async function runPreviewCommand(options: RunPreviewCommandOptions): Promise<FakeContext> {
	return await runRegisteredCommand({
		pi: options.pi,
		commandName: PR_PREVIEW_FEEDBACK_COMMAND_NAME,
		...(options.rawArgs === undefined ? {} : { rawArgs: options.rawArgs }),
		...(options.ctx === undefined ? {} : { ctx: options.ctx }),
	});
}

async function runChecksPreviewCommand(options: RunPreviewCommandOptions): Promise<FakeContext> {
	return await runRegisteredCommand({
		pi: options.pi,
		commandName: PR_PREVIEW_CHECKS_COMMAND_NAME,
		...(options.rawArgs === undefined ? {} : { rawArgs: options.rawArgs }),
		...(options.ctx === undefined ? {} : { ctx: options.ctx }),
	});
}

async function runRegisteredCommand(options: RunRegisteredCommandOptions): Promise<FakeContext> {
	const ctx = options.ctx ?? new FakeContext();
	const rawArgs = options.rawArgs ?? "";
	prPreviewsExtension(options.pi);
	const command = options.pi.commands.get(options.commandName);
	expect(command).toBeDefined();
	await command?.handler(rawArgs, ctx);
	return ctx;
}

describe("PR preview commands", () => {
	test("registers only the preview commands", () => {
		const pi = new FakePi();

		prPreviewsExtension(pi);

		expect([...pi.commands.keys()]).toEqual([
			PR_PREVIEW_FEEDBACK_COMMAND_NAME,
			PR_PREVIEW_CHECKS_COMMAND_NAME,
		]);
	});
});

describe("/pr:preview-checks", () => {
	test("loads stack branches then all stack PR checks in one batched call before opening overlay", async () => {
		const branches = ["feature/base", "feature/top"];
		const pi = new FakePi([
			execResult({ stdout: envelope(stackBranchesData(branches)) }),
			execResult({
				stdout: envelope(
					branchPrChecksData([
						{ branch: "feature/base", prNumber: 700 },
						{ branch: "feature/top", prNumber: 701, checkName: "docs-build" },
					]),
				),
			}),
		]);

		const ctx = await runChecksPreviewCommand({ pi });

		expect(pi.calls).toEqual([
			{ command: "ns", args: ["slot", "gt", "exec", "stack-branches", "--format", "json"] },
			{
				command: "ns",
				args: [
					"address",
					"exec",
					"branch-pr-checks",
					"--branches-json",
					JSON.stringify({ branches }),
					"--format",
					"json",
				],
			},
		]);
		expect(ctx.customCalls).toHaveLength(1);
		expect(ctx.customCalls[0]?.options).toMatchObject({ overlay: true });
	});

	test("renders unmapped stack branches from a negative batched envelope", async () => {
		const branches = ["feature/base", "feature/unmapped"];
		const pi = new FakePi([
			execResult({ stdout: envelope(stackBranchesData(branches)) }),
			execResult({
				code: 1,
				stdout: negativeEnvelope(
					branchPrChecksData([
						{ branch: "feature/base", prNumber: 700 },
						{ branch: "feature/unmapped", status: "missing" },
					]),
				),
			}),
		]);

		const ctx = await runChecksPreviewCommand({ pi });

		expect(pi.calls).toHaveLength(2);
		expect(ctx.customCalls).toHaveLength(1);
		expect(ctx.notifications).toEqual([]);
	});

	test("falls back to the single current-branch view when the batched call hard-fails", async () => {
		const branches = ["feature/base"];
		const pi = new FakePi([
			execResult({ stdout: envelope(stackBranchesData(branches)) }),
			execResult({ code: 2, stdout: "", stderr: "gh exploded" }),
			execResult({ stdout: envelope(previewChecksData(700, "feature/base")) }),
		]);

		const ctx = await runChecksPreviewCommand({ pi });

		expect(pi.calls.map((call) => call.args.slice(0, 3))).toEqual([
			["slot", "gt", "exec"],
			["address", "exec", "branch-pr-checks"],
			["address", "exec", "pr-checks"],
		]);
		expect(ctx.customCalls).toHaveLength(1);
	});

	test("explicit PR number skips stack discovery", async () => {
		const pi = new FakePi(execResult({ stdout: envelope(previewChecksData(456, "feature/pr")) }));

		await runChecksPreviewCommand({ pi, rawArgs: "456" });

		expect(pi.calls).toEqual([
			{
				command: "ns",
				args: ["address", "exec", "pr-checks", "--pr-number", "456", "--format", "json"],
			},
		]);
	});
});

describe("/pr:preview-feedback", () => {
	test("rejects unsupported arguments with preview usage without running the CLI", async () => {
		const pi = new FakePi();

		const ctx = await runPreviewCommand({ pi, rawArgs: "--bad" });

		expect(pi.calls).toEqual([]);
		expect(ctx.customCalls).toEqual([]);
		expect(ctx.notifications).toEqual([
			{ message: "Usage: /pr:preview-feedback [pr-number]", level: "error" },
		]);
	});

	test("requires interactive custom UI before running network commands", async () => {
		const pi = new FakePi();
		const ctx = new FakeContext({ hasUI: false, custom: false });

		await runPreviewCommand({ pi, ctx });

		expect(pi.calls).toEqual([]);
		expect(ctx.customCalls).toEqual([]);
		expect(ctx.notifications).toEqual([
			{
				message: "PR feedback preview requires interactive Pi TUI custom UI.",
				level: "error",
			},
		]);
	});

	test("loads current PR feedback, then review threads, then opens an overlay", async () => {
		const pi = new FakePi([
			execResult({ stdout: envelope(previewDownloadData({ prNumber: 456 })) }),
			execResult({ stdout: envelope(previewThreadsData(1)) }),
		]);

		const ctx = await runPreviewCommand({ pi });

		expect(pi.calls).toEqual([
			{ command: "ns", args: ["address", "exec", "download-feedback", "--format", "json"] },
			{
				command: "ns",
				args: ["address", "exec", "pr-review-threads", "--pr-number", "456", "--format", "json"],
			},
		]);
		expect(ctx.customCalls).toHaveLength(1);
		expect(ctx.customCalls[0]?.options).toMatchObject({ overlay: true });
		expect(ctx.editorTexts).toEqual([]);
		expect(pi.userMessages).toEqual([]);
		expect(ctx.statuses.at(0)).toEqual({
			key: PR_PREVIEW_FEEDBACK_COMMAND_NAME,
			value: "PR feedback preview: loading target…",
		});
		expect(ctx.statuses.at(-1)).toEqual({
			key: PR_PREVIEW_FEEDBACK_COMMAND_NAME,
			value: undefined,
		});
	});

	test("forwards an explicit PR number to target loading and uses resolved target for threads", async () => {
		const pi = new FakePi([
			execResult({ stdout: envelope(previewDownloadData({ prNumber: 789 })) }),
			execResult({ stdout: envelope(previewThreadsData(1)) }),
		]);

		await runPreviewCommand({ pi, rawArgs: "123" });

		expect(pi.calls).toEqual([
			{
				command: "ns",
				args: ["address", "exec", "download-feedback", "--pr-number", "123", "--format", "json"],
			},
			{
				command: "ns",
				args: ["address", "exec", "pr-review-threads", "--pr-number", "789", "--format", "json"],
			},
		]);
	});

	test("does not open a modal when download-feedback finds no PR", async () => {
		const pi = new FakePi(
			execResult({
				stdout: negativeEnvelope({
					found: false,
					target: {
						pr_number: null,
						title: null,
						url: null,
						branch: "feature-preview",
						head_ref_name: null,
						base_ref_name: null,
					},
					counts: counts(),
				}),
				code: 1,
			}),
		);

		const ctx = await runPreviewCommand({ pi });

		expect(pi.calls).toEqual([
			{ command: "ns", args: ["address", "exec", "download-feedback", "--format", "json"] },
		]);
		expect(ctx.customCalls).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "No open PR found for branch feature-preview.",
			level: "warning",
		});
	});

	test("malformed review thread output reports an error", async () => {
		const pi = new FakePi([
			execResult({ stdout: envelope(previewDownloadData({ prNumber: 456 })) }),
			execResult({ stdout: "not json", stderr: "boom", code: 2 }),
		]);

		const ctx = await runPreviewCommand({ pi });

		expect(ctx.customCalls).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain(
			"Malformed ns address exec pr-review-threads #456",
		);
		expect(ctx.notifications.at(-1)?.message).toContain("boom");
	});

	test("opens an empty-state modal for zero unresolved threads", async () => {
		const pi = new FakePi([
			execResult({ stdout: envelope(previewDownloadData({ prNumber: 456 })) }),
			execResult({ stdout: envelope(previewThreadsData(0)) }),
		]);

		const ctx = await runPreviewCommand({ pi });

		expect(ctx.customCalls).toHaveLength(1);
		expect(ctx.customCalls[0]?.options).toMatchObject({ overlay: true });
	});

	test("current PR 1952 comments produce parseable row labels", () => {
		const labels = CURRENT_PR_1952_REVIEW_THREADS.map(buildThreadRowLabel);

		expect(labels[0]).toContain(
			"L304 · info · duplicative-abstractions · fitToWidth utility duplicated",
		);
		expect(labels[1]).toContain(
			"L316 · info · duplicative-abstractions · clamp utility duplicated",
		);
		expect(labels[2]).toContain(
			"L310 · info · duplicative-abstractions · reconcileScroll algorithm overlaps",
		);
		expect(labels[3]).toContain(
			"L183 · warning · ns-typescript-style · Function with 4+ positional parameters",
		);
		expect(new Set(labels).size).toBe(labels.length);
		expect(labels.some((label) => label.includes("pr-preview-feedback-view.ts"))).toBe(false);
		expect(labels.some((label) => label.includes("ts/packages/"))).toBe(false);
		expect(labels.some((label) => /\u001B\[/u.test(label))).toBe(false);
	});

	test("current PR 1952 details lead with core review content", () => {
		const detailLines = buildThreadDetailLines(CURRENT_PR_1952_REVIEW_THREADS[0]);

		expect(detailLines.slice(0, 4)).toEqual([
			"info: fitToWidth utility duplicated from context-profiler/render.ts",
			"Review: duplicative-abstractions",
			"",
			"The new fitToWidth(value: string, width: number) function (line 304) duplicates the implementation already exported from context-profiler/render.ts. Both truncate-then-pad text to a fixed width using truncateToWidth and visibleWidth from pi-tui. The new version adds a width <= 0 guard but is otherwise equivalent. Siblings in the codebase import fitToWidth from context-profiler/render.ts — should the new PrPreviewFeedbackView route through that shared export instead of hand-rolling?",
		]);
		expect(detailLines[0]).not.toContain("Thread");
		expect(detailLines[0]).not.toContain("Path:");
	});

	test("current PR 1952 reviews details omit machine markers and footer noise", () => {
		const details = buildThreadDetailLines(CURRENT_PR_1952_REVIEW_THREADS[0]).join("\n");

		expect(details).toContain(
			"info: fitToWidth utility duplicated from context-profiler/render.ts",
		);
		expect(details).toContain("Review: duplicative-abstractions");
		expect(details).toContain(
			"Evidence: `ts/packages/internal/pi-tools/src/context-profiler/render.ts`",
		);
		expect(details).not.toContain("reviews-inline");
		expect(details).not.toContain("Posted by reviews");
	});

	test("wrapped detail viewport scrolls to the visual bottom", () => {
		const detailLines = buildThreadDetailLines(CURRENT_PR_1952_REVIEW_THREADS[0]);
		const logicalMaxScroll = Math.max(0, detailLines.length - 5);
		const initialViewport = sliceWrappedDetailLinesForViewport({
			lines: detailLines,
			width: 36,
			rows: 5,
			scroll: 0,
		});

		const bottomViewport = sliceWrappedDetailLinesForViewport({
			lines: detailLines,
			width: 36,
			rows: 5,
			scroll: initialViewport.maxScroll,
		});
		const scrolledText = Array.from({ length: initialViewport.maxScroll + 1 }, (_unused, scroll) =>
			sliceWrappedDetailLinesForViewport({
				lines: detailLines,
				width: 36,
				rows: 5,
				scroll,
			}).lines.join("\n"),
		).join("\n");
		const bottomText = bottomViewport.lines.join("\n");

		expect(initialViewport.maxScroll).toBeGreaterThan(logicalMaxScroll);
		expect(bottomViewport.scroll).toBe(initialViewport.maxScroll);
		expect(scrolledText).toContain("Evidence:");
		expect(bottomText).toContain("github-actions");
	});

	test("count mismatch notice is exposed without throwing", () => {
		const notice = buildCountMismatchNotice({
			target: {
				pr_number: 456,
				title: "Preview PR",
				url: null,
				branch: "feature-preview",
				head_ref_name: "feature-preview",
				base_ref_name: "main",
			},
			counts: {
				includedReviewThreads: 3,
				includedReviews: 0,
				includedDiscussionComments: 0,
				excludedResolvedThreads: 0,
				excludedEmptyReviews: 0,
				excludedAutomationComments: 0,
			},
			fetchedAt: new Date("2026-06-20T00:00:00Z"),
			threads: [],
		});

		expect(notice).toEqual([
			"Summary count was 3 unresolved threads when target summary loaded; actual thread rows fetched now: 0.",
		]);
	});
});
