import { describe, expect, test } from "bun:test";

import prFeedbackWatchExtension, {
	buildDetectedFeedbackPrompt,
	feedbackItemKeysFromPrepareRun,
	filterIgnoredFeedback,
	parsePrepareRunData,
	parseWatchCommandArgs,
	type ExtensionAPI,
	type ExtensionContext,
	type PrAddressRunner,
} from "../src/pr-feedback-watch.ts";

const ROOT = "/repo";
const RUNNER: PrAddressRunner = { command: "pr-address-run", baseArgs: [] };

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
	args: string[];
	result: Partial<ExecResult>;
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
		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
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
	idle = true;
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
		return this.idle;
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

function step(command: string, args: string[], result: Partial<ExecResult> = {}): ScriptedExec {
	return { command, args, result };
}

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function envelope(data: object): string {
	return JSON.stringify({ exit_code: 0, data });
}

function prepareStep(data: object, sessionId: string): ScriptedExec {
	return step("pr-address-run", ["exec", "prepare-run", "--payload-session-id", sessionId, "--format", "json"], {
		stdout: envelope(data),
	});
}

function currentUserStep(login = "schrockn"): ScriptedExec {
	return step("gh", ["api", "user", "--jq", ".login"], { stdout: `${login}\n` });
}

function headOidStep(prNumber = 123, oid = "abc123"): ScriptedExec {
	return step("gh", ["pr", "view", String(prNumber), "--json", "headRefOid", "--jq", ".headRefOid"], { stdout: `${oid}\n` });
}

function cleanStep(): ScriptedExec {
	return step("git", ["status", "--porcelain=v1"], { stdout: "" });
}

function dirtyStep(): ScriptedExec {
	return step("git", ["status", "--porcelain=v1"], { stdout: " M file.ts\n" });
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
	test("parses status by default and start options", () => {
		expect(parseWatchCommandArgs("")).toMatchObject({ type: "valid", action: "status" });
		expect(parseWatchCommandArgs("start --interval-seconds 120 --allow-dirty --dispatch-existing")).toEqual({
			type: "valid",
			action: "start",
			options: { intervalMs: 120_000, allowDirty: true, dispatchExisting: true },
		});
	});

	test("rejects unknown actions, unknown options, and too-small intervals", () => {
		expect(parseWatchCommandArgs("bogus")).toMatchObject({ type: "invalid" });
		expect(parseWatchCommandArgs("start --wat")).toMatchObject({ type: "invalid" });
		expect(parseWatchCommandArgs("start --interval-seconds 30")).toMatchObject({ type: "invalid" });
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

describe("pr feedback watch extension", () => {
	test("registers command and lifecycle hooks without starting polling", () => {
		const pi = new FakePi();
		prFeedbackWatchExtension(pi, { runner: RUNNER });

		expect([...pi.commands.keys()]).toEqual(["code:pr-feedback-watch"]);
		expect(pi.events).toEqual(["session_start", "agent_end", "session_shutdown"]);
		expect(pi.calls).toEqual([]);
	});

	test("start baselines existing feedback without dispatching", async () => {
		const pi = new FakePi([prepareStep(compactManifest(), "pr-feedback-watch-unknown-1"), currentUserStep(), headOidStep()]);
		const ctx = new FakeContext();
		prFeedbackWatchExtension(pi, { runner: RUNNER });

		await pi.commands.get("code:pr-feedback-watch")?.handler("start", ctx);

		expect(pi.userMessages).toEqual([]);
		expect(pi.entries.map((entry) => entry.data).some((entry) => JSON.stringify(entry).includes("baseline"))).toBe(true);
		expect(ctx.notifications.at(-1)?.message).toContain("existing feedback was baselined");
		pi.assertDone();
	});

	test("once without dispatch-existing baselines current feedback", async () => {
		const pi = new FakePi([prepareStep(compactManifest(), "pr-feedback-watch-unknown-1"), currentUserStep(), headOidStep()]);
		const ctx = new FakeContext();
		prFeedbackWatchExtension(pi, { runner: RUNNER });

		await pi.commands.get("code:pr-feedback-watch")?.handler("once", ctx);

		expect(pi.userMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toContain("baselined");
		pi.assertDone();
	});

	test("once with dispatch-existing sends constrained prompt", async () => {
		const pi = new FakePi([prepareStep(compactManifest(), "pr-feedback-watch-unknown-1"), currentUserStep(), headOidStep(), cleanStep()]);
		const ctx = new FakeContext();
		prFeedbackWatchExtension(pi, { runner: RUNNER });

		await pi.commands.get("code:pr-feedback-watch")?.handler("once --dispatch-existing", ctx);

		expect(pi.userMessages).toHaveLength(1);
		expect(pi.userMessages[0]).toContain("thread-comment:PRRT_1:10");
		expect(pi.userMessages[0]).not.toContain("discussion:90");
		pi.assertDone();
	});

	test("after baseline, a new comment dispatches once", async () => {
		const pi = new FakePi([
			prepareStep(compactManifest([10]), "pr-feedback-watch-unknown-1"),
			currentUserStep(),
			headOidStep(),
			prepareStep(compactManifest([10, 11]), "pr-feedback-watch-123-2"),
			headOidStep(),
			cleanStep(),
			prepareStep(compactManifest([10, 11]), "pr-feedback-watch-123-3"),
			headOidStep(),
			cleanStep(),
		]);
		const ctx = new FakeContext();
		prFeedbackWatchExtension(pi, { runner: RUNNER });

		await pi.commands.get("code:pr-feedback-watch")?.handler("start", ctx);
		await pi.commands.get("code:pr-feedback-watch")?.handler("once", ctx);
		await pi.commands.get("code:pr-feedback-watch")?.handler("once", ctx);

		expect(pi.userMessages).toHaveLength(1);
		expect(pi.userMessages[0]).toContain("thread-comment:PRRT_1:11");
		pi.assertDone();
	});

	test("start with dispatch-existing pauses on dirty tree", async () => {
		const pi = new FakePi([prepareStep(compactManifest(), "pr-feedback-watch-unknown-1"), currentUserStep(), headOidStep(), dirtyStep()]);
		const ctx = new FakeContext();
		prFeedbackWatchExtension(pi, { runner: RUNNER });

		await pi.commands.get("code:pr-feedback-watch")?.handler("start --dispatch-existing", ctx);

		expect(pi.userMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toContain("dirty");
		pi.assertDone();
	});

	test("dirty tree pauses dispatch unless allow-dirty is set", async () => {
		const pi = new FakePi([
			prepareStep(compactManifest(), "pr-feedback-watch-unknown-1"),
			currentUserStep(),
			headOidStep(),
			dirtyStep(),
			prepareStep(compactManifest(), "pr-feedback-watch-123-2"),
			headOidStep(),
			dirtyStep(),
		]);
		const ctx = new FakeContext();
		prFeedbackWatchExtension(pi, { runner: RUNNER });

		await pi.commands.get("code:pr-feedback-watch")?.handler("once --dispatch-existing", ctx);
		expect(pi.userMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toContain("dirty");

		await pi.commands.get("code:pr-feedback-watch")?.handler("once --dispatch-existing --allow-dirty", ctx);
		expect(pi.userMessages).toHaveLength(1);
		pi.assertDone();
	});
});
