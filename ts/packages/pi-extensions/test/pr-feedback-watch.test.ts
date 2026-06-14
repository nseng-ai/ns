import { describe, expect, test, vi } from "vitest";

import prFeedbackWatchExtension, {
	buildDetectedFeedbackPrompt,
	buildFeedbackFingerprint,
	feedbackItemKeysFromPrepareRun,
	filterIgnoredFeedback,
	parseDiscussionCommentFingerprint,
	parseGitHubPullRequestUrl,
	parsePrepareRunData,
	parseReviewCommentFingerprint,
	parseReviewFingerprint,
	parseWatchCommandArgs,
	type ExtensionAPI,
	type ExtensionContext,
	type PrAddressRunner,
} from "../src/pr-feedback-watch.ts";

const ROOT = "/repo";
const RUNNER: PrAddressRunner = { command: "pr-address", baseArgs: [] };

interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed?: boolean;
}

interface ExecCall {
	command: string;
	args: string[];
}

interface ScriptedExec {
	command: string;
	args: string[] | ((args: string[]) => boolean);
	description?: string;
	result: Partial<ExecResult>;
}

interface StepOptions {
	result?: Partial<ExecResult>;
	description?: string;
}

interface RegisteredCommand {
	description?: string;
	handler(args: string, ctx: ExtensionContext): Promise<void> | void;
}

type EventName = "session_start" | "agent_end" | "session_shutdown";
type EventHandler = ((event: unknown, ctx: ExtensionContext) => Promise<void> | void) | (() => Promise<void> | void);

class FakePi implements ExtensionAPI {
	readonly calls: ExecCall[] = [];
	readonly commands = new Map<string, RegisteredCommand>();
	readonly events: EventName[] = [];
	readonly handlers = new Map<EventName, EventHandler>();
	readonly userMessages: string[] = [];
	readonly customMessages: string[] = [];
	readonly entries: Array<{ customType: string; data: unknown }> = [];
	readonly errors: string[] = [];
	private readonly script: ScriptedExec[];

	constructor(script: ScriptedExec[] = []) {
		this.script = [...script];
	}

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	on(event: "session_start", handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void): void;
	on(event: "agent_end" | "session_shutdown", handler: () => Promise<void> | void): void;
	on(event: EventName, handler: EventHandler): void {
		this.events.push(event);
		this.handlers.set(event, handler);
	}

	async exec(command: string, args: string[]): Promise<ExecResult> {
		this.calls.push({ command, args: [...args] });
		const expected = this.script.shift();
		if (expected === undefined) {
			const message = `unexpected exec: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}
		if (expected.command !== command || !matchesArgs(expected.args, args)) {
			const expectedArgs = Array.isArray(expected.args) ? expected.args.join(" ") : (expected.description ?? "<custom args matcher>");
			const message = `expected ${expected.command} ${expectedArgs}, got ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}
		return execResult(expected.result);
	}

	sendUserMessage(content: string): void {
		this.userMessages.push(content);
	}

	sendMessage(message: { content: string }): void {
		this.customMessages.push(message.content);
	}

	appendEntry(customType: string, data: unknown): void {
		this.entries.push({ customType, data });
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

class FakeContext implements ExtensionContext {
	readonly cwd = ROOT;
	readonly hasUI = true;
	readonly notifications: Array<{ message: string; level: string | undefined }> = [];
	readonly statuses = new Map<string, string | undefined>();
	readonly editorTexts: string[] = [];
	waitForIdleCalls = 0;
	isIdleState = true;
	readonly ui = {
		notify: (message: string, level?: "info" | "warning" | "error") => {
			this.notifications.push({ message, level });
		},
		setStatus: (key: string, value: string | undefined) => {
			this.statuses.set(key, value);
		},
		setEditorText: (text: string) => {
			this.editorTexts.push(text);
		},
	};

	async waitForIdle(): Promise<void> {
		this.waitForIdleCalls += 1;
	}

	isIdle(): boolean {
		return this.isIdleState;
	}
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

function step(command: string, args: string[] | ((args: string[]) => boolean), options: StepOptions = {}): ScriptedExec {
	const result = options.result ?? {};
	return options.description === undefined ? { command, args, result } : { command, args, result, description: options.description };
}

function matchesArgs(expected: string[] | ((args: string[]) => boolean), actual: string[]): boolean {
	if (Array.isArray(expected)) return expected.length === actual.length && expected.every((value, index) => value === actual[index]);
	return expected(actual);
}

function envelope(data: object): string {
	return JSON.stringify({ exit_code: 0, data });
}

function prepareStep(data: object, harnessSessionId: string): ScriptedExec {
	return step("pr-address", ["exec", "prepare-run", "--harness-session-id", harnessSessionId, "--format", "json"], {
		result: { stdout: envelope(data) },
	});
}

function currentUserStep(login = "schrockn"): ScriptedExec {
	return step("gh", ["api", "user", "--jq", ".login"], { result: { stdout: `${login}\n` } });
}

function headOidStep(prNumber = 123, oid = "abc123"): ScriptedExec {
	return step("gh", ["pr", "view", String(prNumber), "--json", "headRefOid", "--jq", ".headRefOid"], { result: { stdout: `${oid}\n` } });
}

function discussionFingerprintStep(items: object[]): ScriptedExec {
	return restFingerprintStep("issues/123/comments", "[.[] | {id, created_at, updated_at, author: .user.login}]", items);
}

function reviewFingerprintStep(items: object[]): ScriptedExec {
	return restFingerprintStep("pulls/123/reviews", "[.[] | {id, node_id, state, submitted_at, commit_id, author: .user.login}]", items);
}

function reviewCommentFingerprintStep(items: object[]): ScriptedExec {
	return restFingerprintStep(
		"pulls/123/comments",
		"[.[] | {id, pull_request_review_id, created_at, updated_at, path, line, in_reply_to_id, author: .user.login}]",
		items,
	);
}

function restFingerprintStep(pathFragment: string, jq: string, items: object[]): ScriptedExec {
	return step(
		"gh",
		(args) => args[0] === "api" && args[1] === "--method" && args[2] === "GET" && args[3] !== undefined && args[3].includes(pathFragment) && args[4] === "--jq" && args[5] === jq,
		{ result: { stdout: JSON.stringify(items) }, description: `api ${pathFragment}` },
	);
}

function restFingerprintSteps(options: { discussion?: object[]; reviews?: object[]; reviewComments?: object[] } = {}): ScriptedExec[] {
	return [discussionFingerprintStep(options.discussion ?? []), reviewFingerprintStep(options.reviews ?? []), reviewCommentFingerprintStep(options.reviewComments ?? [])];
}

function reviewCommentRestItem(id: number): object {
	return {
		id,
		pull_request_review_id: 1,
		created_at: "2026-06-07T00:00:00Z",
		updated_at: `2026-06-07T00:00:${String(id).padStart(2, "0")}Z`,
		path: "src/file.ts",
		line: id,
		author: "reviewer",
	};
}

function cleanStep(): ScriptedExec {
	return step("git", ["status", "--porcelain=v1"], { result: { stdout: "" } });
}

function dirtyStep(): ScriptedExec {
	return step("git", ["status", "--porcelain=v1"], { result: { stdout: " M file.ts\n" } });
}

function compactManifest(commentIds: number[] = [10]): object {
	return {
		found: true,
		current_branch: "feature/pr-watch",
		number: 123,
		title: "PR title",
		url: "https://github.com/acme/repo/pull/123",
		head_ref_name: "feature/pr-watch",
		base_ref_name: "main",
		state: "OPEN",
		payload_reference: { payload_path: "/tmp/pr-watch.raw.json" },
		reviews: [],
		review_threads: [
			{
				thread_id: "PRRT_1",
				path: "src/file.ts",
				line: 7,
				start_line: 7,
				is_resolved: false,
				is_outdated: false,
				comments: commentIds.map((id, index) => ({
					id,
					author: index === 0 ? "github-actions" : "reviewer",
					path: "src/file.ts",
					line: 7 + index,
					start_line: null,
					created_at: "2026-06-07T00:00:00Z",
					body_locator: {
						json_pointer: `/data/review_threads/0/comments/${index}/body`,
						item_pointer: `/data/review_threads/0/comments/${index}`,
					},
				})),
			},
		],
		discussion_comments: [
			{
				comment_id: 90,
				author: "vercel[bot]",
				url: "https://github.com/acme/repo/pull/123#issuecomment-90",
				body_locator: { json_pointer: "/data/discussion_comments/0/body", item_pointer: "/data/discussion_comments/0" },
			},
			{
				comment_id: 91,
				author: "schrockn",
				url: "https://github.com/acme/repo/pull/123#issuecomment-91",
				body_locator: { json_pointer: "/data/discussion_comments/1/body", item_pointer: "/data/discussion_comments/1" },
			},
		],
	};
}

describe("pr feedback watch command parsing", () => {
	test("parses bare command as toggle with dispatch defaults", () => {
		expect(parseWatchCommandArgs("")).toEqual({
			type: "valid",
			action: "toggle",
			options: { intervalMs: 15_000, shouldAllowDirty: true, existingFeedbackMode: "dispatch" },
		});
	});

	test("parses explicit start and once with dispatch defaults", () => {
		expect(parseWatchCommandArgs("start")).toEqual({
			type: "valid",
			action: "start",
			options: { intervalMs: 15_000, shouldAllowDirty: true, existingFeedbackMode: "dispatch" },
		});
		expect(parseWatchCommandArgs("once")).toEqual({
			type: "valid",
			action: "once",
			options: { intervalMs: 15_000, shouldAllowDirty: true, existingFeedbackMode: "dispatch" },
		});
	});

	test("parses implicit start options and existing feedback mode flags", () => {
		expect(parseWatchCommandArgs("--interval-seconds 10 --allow-dirty")).toEqual({
			type: "valid",
			action: "start",
			options: { intervalMs: 10_000, shouldAllowDirty: true, existingFeedbackMode: "dispatch" },
		});
		expect(parseWatchCommandArgs("start --baseline-existing")).toEqual({
			type: "valid",
			action: "start",
			options: { intervalMs: 15_000, shouldAllowDirty: true, existingFeedbackMode: "baseline" },
		});
		expect(parseWatchCommandArgs("start --dispatch-existing")).toEqual({
			type: "valid",
			action: "start",
			options: { intervalMs: 15_000, shouldAllowDirty: true, existingFeedbackMode: "dispatch" },
		});
		expect(parseWatchCommandArgs("start --pause-on-dirty")).toEqual({
			type: "valid",
			action: "start",
			options: { intervalMs: 15_000, shouldAllowDirty: false, existingFeedbackMode: "dispatch" },
		});
		expect(parseWatchCommandArgs("status")).toMatchObject({ type: "valid", action: "status" });
	});

	test("rejects unknown actions, unknown options, conflicting modes, and too-small intervals", () => {
		expect(parseWatchCommandArgs("bogus")).toMatchObject({ type: "invalid" });
		expect(parseWatchCommandArgs("start --wat")).toMatchObject({ type: "invalid" });
		expect(parseWatchCommandArgs("start --interval-seconds 9")).toMatchObject({ type: "invalid" });
		expect(parseWatchCommandArgs("start --dispatch-existing --baseline-existing")).toMatchObject({ type: "invalid" });
	});
});

describe("pr feedback watch manifest helpers", () => {
	test("extracts deterministic keys and ignores only selected authors", () => {
		const parsed = parsePrepareRunData(compactManifest());
		expect(parsed.type).toBe("valid");
		if (parsed.type !== "valid") return;

		const keys = feedbackItemKeysFromPrepareRun(parsed.data);
		expect(keys.map((item) => item.key)).toEqual(["thread-comment:PRRT_1:10", "discussion:90", "discussion:91"]);
		const filtered = filterIgnoredFeedback(keys, { currentUserLogin: "schrockn" });
		expect(filtered.actionableTriggerItems.map((item) => item.key)).toEqual(["thread-comment:PRRT_1:10"]);
		expect(filtered.ignoredItems.map((item) => [item.item.key, item.reason])).toEqual([
			["discussion:90", "status_bot"],
			["discussion:91", "current_user"],
		]);
	});

	test("builds a constrained pr-address prompt", () => {
		const parsed = parsePrepareRunData(compactManifest());
		expect(parsed.type).toBe("valid");
		if (parsed.type !== "valid") return;
		const item = feedbackItemKeysFromPrepareRun(parsed.data)[0];
		expect(item).toBeDefined();
		if (item === undefined) return;
		const prompt = buildDetectedFeedbackPrompt({ data: parsed.data, payloadPath: parsed.data.payloadPath, items: [item] });

		expect(prompt).toContain("Automated PR feedback watch trigger.");
		expect(prompt).toContain("PR: #123 PR title");
		expect(prompt).toContain("Payload artifact: /tmp/pr-watch.raw.json");
		expect(prompt).toContain("thread_comment/thread-comment:PRRT_1:10");
		expect(prompt).toContain("Do not push, submit, or create branches.");
		expect(prompt).toContain("Use the installed `pr-address` skill/workflow");
	});
});

describe("pr feedback watch REST fingerprint helpers", () => {
	test("parses GitHub PR URLs and rejects malformed URLs", () => {
		expect(parseGitHubPullRequestUrl("https://github.com/dagster-io/asdl-tools/pull/1036", undefined)).toEqual({
			owner: "dagster-io",
			repo: "asdl-tools",
			number: 1036,
			url: "https://github.com/dagster-io/asdl-tools/pull/1036",
		});
		expect(parseGitHubPullRequestUrl("https://example.com/dagster-io/asdl-tools/pull/1036", undefined)).toBeUndefined();
		expect(parseGitHubPullRequestUrl("https://github.com/dagster-io/asdl-tools/issues/1036", undefined)).toBeUndefined();
	});

	test("parses minimal REST feedback fields and ignores malformed optional fields", () => {
		expect(parseDiscussionCommentFingerprint([{ id: 90, updated_at: "2026-06-07T00:00:00Z", author: "reviewer" }, { nope: true }])).toEqual([
			{ kind: "discussion_comment", id: "90", updatedAt: "2026-06-07T00:00:00Z", author: "reviewer" },
		]);
		expect(parseReviewFingerprint([{ id: 1, state: "CHANGES_REQUESTED", submitted_at: "2026-06-07T00:01:00Z", commit_id: "abc", author: "octo" }])).toEqual([
			{ kind: "review", id: "1", updatedAt: "2026-06-07T00:01:00Z", author: "octo", state: "CHANGES_REQUESTED", commitId: "abc" },
		]);
		expect(parseReviewCommentFingerprint([{ id: 10, pull_request_review_id: 1, path: "src/file.ts", line: 7, in_reply_to_id: "9", updated_at: "2026-06-07T00:02:00Z" }])).toEqual([
			{ kind: "review_comment", id: "10", updatedAt: "2026-06-07T00:02:00Z", path: "src/file.ts", line: 7, reviewId: "1", inReplyToId: "9" },
		]);
	});

	test("builds deterministic fingerprint keys independent of response order", () => {
		const left = buildFeedbackFingerprint([
			{ kind: "review_comment", id: "11", updatedAt: "2026-06-07T00:02:00Z" },
			{ kind: "discussion_comment", id: "90", updatedAt: "2026-06-07T00:00:00Z" },
		], "2026-06-07T00:03:00Z");
		const right = buildFeedbackFingerprint([
			{ kind: "discussion_comment", id: "90", updatedAt: "2026-06-07T00:00:00Z" },
			{ kind: "review_comment", id: "11", updatedAt: "2026-06-07T00:02:00Z" },
		], "2026-06-07T00:04:00Z");
		const changed = buildFeedbackFingerprint([
			{ kind: "discussion_comment", id: "90", updatedAt: "2026-06-07T00:00:00Z" },
			{ kind: "review_comment", id: "12", updatedAt: "2026-06-07T00:02:00Z" },
		], "2026-06-07T00:05:00Z");

		expect(left.key).toBe(right.key);
		expect(changed.key).not.toBe(left.key);
		expect(left.latestTimestamp).toBe("2026-06-07T00:02:00Z");
	});
});

describe("pr feedback watch extension", () => {
	test("registers command and lifecycle hooks without starting polling", () => {
		const pi = new FakePi();
		prFeedbackWatchExtension(pi, { runner: RUNNER });

		expect([...pi.commands.keys()]).toEqual(["code:pr-feedback-watch"]);
		expect(pi.events).toEqual(["session_start", "agent_end", "session_shutdown"]);
		expect(pi.calls).toEqual([]);
	});

	test("empty command starts and dispatches existing actionable feedback", async () => {
		const pi = new FakePi([prepareStep(compactManifest(), "pr-feedback-watch-1"), currentUserStep(), headOidStep(), ...restFingerprintSteps(), cleanStep()]);
		const ctx = new FakeContext();
		prFeedbackWatchExtension(pi, { runner: RUNNER });

		await pi.commands.get("code:pr-feedback-watch")?.handler("", ctx);

		expect(pi.userMessages).toHaveLength(1);
		expect(pi.userMessages[0]).toContain("thread-comment:PRRT_1:10");
		expect(pi.userMessages[0]).not.toContain("discussion:90");
		pi.assertDone();
	});

	test("start with baseline-existing preserves old baseline behavior", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-06-14T05:40:00.000Z"));
		try {
			const pi = new FakePi([prepareStep(compactManifest(), "pr-feedback-watch-1"), currentUserStep(), headOidStep(), ...restFingerprintSteps()]);
			const ctx = new FakeContext();
			prFeedbackWatchExtension(pi, { runner: RUNNER });

			await pi.commands.get("code:pr-feedback-watch")?.handler("start --baseline-existing", ctx);

			expect(pi.userMessages).toEqual([]);
			expect(pi.entries.map((entry) => entry.data).some((entry) => JSON.stringify(entry).includes("baseline"))).toBe(true);
			expect(ctx.notifications.at(-1)?.message).toContain("existing feedback was baselined");
			expect(ctx.statuses.get("code:pr-feedback-watch")).toBe("PR watch: #123 REST polling 15s · checked 0s ago · /code:pr-feedback-watch stops");

			vi.advanceTimersByTime(5_000);
			expect(ctx.statuses.get("code:pr-feedback-watch")).toBe("PR watch: #123 REST polling 15s · checked 5s ago · /code:pr-feedback-watch stops");

			await pi.commands.get("code:pr-feedback-watch")?.handler("stop", ctx);
			pi.assertDone();
		} finally {
			vi.useRealTimers();
		}
	});

	test("once dispatches current feedback by default", async () => {
		const pi = new FakePi([prepareStep(compactManifest(), "pr-feedback-watch-1"), currentUserStep(), headOidStep(), cleanStep()]);
		const ctx = new FakeContext();
		prFeedbackWatchExtension(pi, { runner: RUNNER });

		await pi.commands.get("code:pr-feedback-watch")?.handler("once", ctx);

		expect(pi.userMessages).toHaveLength(1);
		expect(pi.userMessages[0]).toContain("thread-comment:PRRT_1:10");
		pi.assertDone();
	});

	test("once with baseline-existing baselines current feedback", async () => {
		const pi = new FakePi([prepareStep(compactManifest(), "pr-feedback-watch-1"), currentUserStep(), headOidStep()]);
		const ctx = new FakeContext();
		prFeedbackWatchExtension(pi, { runner: RUNNER });

		await pi.commands.get("code:pr-feedback-watch")?.handler("once --baseline-existing", ctx);

		expect(pi.userMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toContain("baselined");
		pi.assertDone();
	});

	test("once with dispatch-existing sends constrained prompt", async () => {
		const pi = new FakePi([prepareStep(compactManifest(), "pr-feedback-watch-1"), currentUserStep(), headOidStep(), cleanStep()]);
		const ctx = new FakeContext();
		prFeedbackWatchExtension(pi, { runner: RUNNER });

		await pi.commands.get("code:pr-feedback-watch")?.handler("once --dispatch-existing", ctx);

		expect(pi.userMessages).toHaveLength(1);
		expect(pi.userMessages[0]).toContain("thread-comment:PRRT_1:10");
		expect(pi.userMessages[0]).not.toContain("discussion:90");
		pi.assertDone();
	});

	test("unchanged cheap poll avoids heavy work", async () => {
		const pi = new FakePi([
			prepareStep(compactManifest([10]), "pr-feedback-watch-1"),
			currentUserStep(),
			headOidStep(),
			...restFingerprintSteps(),
			...restFingerprintSteps(),
		]);
		const ctx = new FakeContext();
		prFeedbackWatchExtension(pi, { runner: RUNNER });

		await pi.commands.get("code:pr-feedback-watch")?.handler("start --baseline-existing", ctx);
		await pi.commands.get("code:pr-feedback-watch")?.handler("once --baseline-existing", ctx);

		expect(pi.userMessages).toEqual([]);
		expect(pi.calls.filter((call) => call.command === "pr-address")).toHaveLength(1);
		pi.assertDone();
	});

	test("after baseline, a new comment dispatches once", async () => {
		const changedRest = { reviewComments: [reviewCommentRestItem(11)] };
		const pi = new FakePi([
			prepareStep(compactManifest([10]), "pr-feedback-watch-1"),
			currentUserStep(),
			headOidStep(),
			...restFingerprintSteps(),
			...restFingerprintSteps(changedRest),
			cleanStep(),
			prepareStep(compactManifest([10, 11]), "pr-feedback-watch-1"),
			headOidStep(),
			...restFingerprintSteps(changedRest),
		]);
		const ctx = new FakeContext();
		prFeedbackWatchExtension(pi, { runner: RUNNER });

		await pi.commands.get("code:pr-feedback-watch")?.handler("start --baseline-existing", ctx);
		await pi.commands.get("code:pr-feedback-watch")?.handler("once --baseline-existing", ctx);
		await pi.commands.get("code:pr-feedback-watch")?.handler("once --baseline-existing", ctx);

		expect(pi.userMessages).toHaveLength(1);
		expect(pi.userMessages[0]).toContain("thread-comment:PRRT_1:11");
		pi.assertDone();
	});

	test("changed REST fingerprint with no actionable manifest items advances without dispatch", async () => {
		const changedRest = { discussion: [{ id: 92, updated_at: "2026-06-07T00:00:30Z", author: "schrockn" }] };
		const pi = new FakePi([
			prepareStep(compactManifest([10]), "pr-feedback-watch-1"),
			currentUserStep(),
			headOidStep(),
			...restFingerprintSteps(),
			...restFingerprintSteps(changedRest),
			cleanStep(),
			prepareStep(compactManifest([10]), "pr-feedback-watch-1"),
			headOidStep(),
		]);
		const ctx = new FakeContext();
		prFeedbackWatchExtension(pi, { runner: RUNNER });

		await pi.commands.get("code:pr-feedback-watch")?.handler("start --baseline-existing", ctx);
		await pi.commands.get("code:pr-feedback-watch")?.handler("once --baseline-existing", ctx);

		expect(pi.userMessages).toEqual([]);
		expect(pi.calls.filter((call) => call.command === "pr-address")).toHaveLength(2);
		pi.assertDone();
	});

	test("pause-on-dirty pauses before heavy normalization after REST changes", async () => {
		const pi = new FakePi([
			prepareStep(compactManifest([10]), "pr-feedback-watch-1"),
			currentUserStep(),
			headOidStep(),
			...restFingerprintSteps(),
			...restFingerprintSteps({ reviewComments: [reviewCommentRestItem(11)] }),
			dirtyStep(),
		]);
		const ctx = new FakeContext();
		prFeedbackWatchExtension(pi, { runner: RUNNER });

		await pi.commands.get("code:pr-feedback-watch")?.handler("start --baseline-existing --pause-on-dirty", ctx);
		await pi.commands.get("code:pr-feedback-watch")?.handler("once --baseline-existing --pause-on-dirty", ctx);

		expect(pi.userMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toContain("dirty");
		expect(pi.calls.filter((call) => call.command === "pr-address")).toHaveLength(1);
		pi.assertDone();
	});

	test("REST failures warn without dispatching or heavy retry before threshold", async () => {
		const pi = new FakePi([
			prepareStep(compactManifest([10]), "pr-feedback-watch-1"),
			currentUserStep(),
			headOidStep(),
			...restFingerprintSteps(),
			step("gh", (args) => args[0] === "api" && args[3] !== undefined && args[3].includes("issues/123/comments"), {
				result: { code: 1, stderr: "rate limited" },
				description: "failed discussion REST",
			}),
			reviewFingerprintStep([]),
			reviewCommentFingerprintStep([]),
		]);
		const ctx = new FakeContext();
		prFeedbackWatchExtension(pi, { runner: RUNNER });

		await pi.commands.get("code:pr-feedback-watch")?.handler("start --baseline-existing", ctx);
		await pi.commands.get("code:pr-feedback-watch")?.handler("once --baseline-existing", ctx);

		expect(pi.userMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toContain("REST check failed");
		expect(pi.calls.filter((call) => call.command === "pr-address")).toHaveLength(1);
		pi.assertDone();
	});

	test("start with dispatch-existing works on dirty tree by default", async () => {
		const pi = new FakePi([prepareStep(compactManifest(), "pr-feedback-watch-1"), currentUserStep(), headOidStep(), ...restFingerprintSteps(), dirtyStep()]);
		const ctx = new FakeContext();
		prFeedbackWatchExtension(pi, { runner: RUNNER });

		await pi.commands.get("code:pr-feedback-watch")?.handler("start --dispatch-existing", ctx);

		expect(pi.userMessages).toHaveLength(1);
		expect(pi.userMessages[0]).toContain("thread-comment:PRRT_1:10");
		pi.assertDone();
	});

	test("bare command toggles active watcher off without retracting queued prompt", async () => {
		const pi = new FakePi([prepareStep(compactManifest(), "pr-feedback-watch-1"), currentUserStep(), headOidStep(), ...restFingerprintSteps(), cleanStep()]);
		const ctx = new FakeContext();
		prFeedbackWatchExtension(pi, { runner: RUNNER });

		await pi.commands.get("code:pr-feedback-watch")?.handler("", ctx);
		await pi.commands.get("code:pr-feedback-watch")?.handler("", ctx);

		expect(pi.userMessages).toHaveLength(1);
		expect(ctx.notifications.at(-1)?.message).toBe("PR feedback watch stopped.");
		expect(ctx.statuses.get("code:pr-feedback-watch")).toBeUndefined();
		expect(pi.entries.map((entry) => entry.data).some((entry) => JSON.stringify(entry).includes("stopped"))).toBe(true);
		pi.assertDone();
	});

	test("explicit stop remains supported", async () => {
		const pi = new FakePi([prepareStep(compactManifest(), "pr-feedback-watch-1"), currentUserStep(), headOidStep(), ...restFingerprintSteps()]);
		const ctx = new FakeContext();
		prFeedbackWatchExtension(pi, { runner: RUNNER });

		await pi.commands.get("code:pr-feedback-watch")?.handler("start --baseline-existing", ctx);
		await pi.commands.get("code:pr-feedback-watch")?.handler("stop", ctx);

		expect(ctx.notifications.at(-1)?.message).toBe("PR feedback watch stopped.");
		expect(ctx.statuses.get("code:pr-feedback-watch")).toBeUndefined();
		pi.assertDone();
	});

	test("pause-on-dirty pauses dispatch unless allow-dirty is set", async () => {
		const pi = new FakePi([
			prepareStep(compactManifest(), "pr-feedback-watch-1"),
			currentUserStep(),
			headOidStep(),
			dirtyStep(),
			prepareStep(compactManifest(), "pr-feedback-watch-1"),
			headOidStep(),
			dirtyStep(),
		]);
		const ctx = new FakeContext();
		prFeedbackWatchExtension(pi, { runner: RUNNER });

		await pi.commands.get("code:pr-feedback-watch")?.handler("once --dispatch-existing --pause-on-dirty", ctx);
		expect(pi.userMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toContain("dirty");

		await pi.commands.get("code:pr-feedback-watch")?.handler("once --dispatch-existing --allow-dirty", ctx);
		expect(pi.userMessages).toHaveLength(1);
		pi.assertDone();
	});
});
