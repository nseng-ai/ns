import { describe, expect, test } from "vitest";

import {
	registerHarnessSessionExtension,
	shellSingleQuote,
	type ExtensionAPI,
	type ToolCallResult,
} from "../src/harness-session.ts";

interface TestSessionContext {
	sessionManager: {
		getSessionFile(): string | undefined;
		getEntries(): readonly unknown[];
	};
}

type SessionStartHandler = (event: unknown, ctx: TestSessionContext) => Promise<void> | void;
type ToolCallHandler = (
	event: { toolName: string; input: unknown },
	ctx: unknown,
) => ToolCallResult | void | Promise<ToolCallResult | void>;

interface FakeEntry {
	type: "custom";
	customType: string;
	data?: unknown;
}

class FakePi implements ExtensionAPI {
	readonly entries: FakeEntry[] = [];
	private sessionStartHandler: SessionStartHandler | undefined;
	private toolCallHandler: ToolCallHandler | undefined;

	on(event: "session_start", handler: SessionStartHandler): void;
	on(event: "tool_call", handler: ToolCallHandler): void;
	on(event: "session_start" | "tool_call", handler: SessionStartHandler | ToolCallHandler): void {
		if (event === "session_start") this.sessionStartHandler = handler as SessionStartHandler;
		else this.toolCallHandler = handler as ToolCallHandler;
	}

	appendEntry(customType: string, data?: unknown): void {
		this.entries.push({ type: "custom", customType, data });
	}

	async emitSessionStart(
		options: { sessionFile?: string | undefined; entries?: readonly unknown[] | undefined } = {},
	): Promise<void> {
		if (this.sessionStartHandler === undefined)
			throw new Error("session_start handler not registered");
		await this.sessionStartHandler(
			{},
			{
				sessionManager: {
					getSessionFile: () => options.sessionFile,
					getEntries: () => options.entries ?? this.entries,
				},
			},
		);
	}

	async emitBash(command: string): Promise<{ command: string; result: ToolCallResult | void }> {
		if (this.toolCallHandler === undefined) throw new Error("tool_call handler not registered");
		const event = { toolName: "bash", input: { command } };
		const result = await this.toolCallHandler(event, {});
		return { command: event.input.command, result };
	}

	async emitReadTool(): Promise<ToolCallResult | void> {
		if (this.toolCallHandler === undefined) throw new Error("tool_call handler not registered");
		return await this.toolCallHandler({ toolName: "read", input: { path: "README.md" } }, {});
	}
}

function register(pi: FakePi): ReturnType<typeof registerHarnessSessionExtension> {
	return registerHarnessSessionExtension(pi, { nowMs: () => 1234, entropy: () => "abc123" });
}

describe("harness session extension", () => {
	test("derives an opaque harness session id from the persisted Pi session file", async () => {
		const pi = new FakePi();
		const state = register(pi);

		await pi.emitSessionStart({ sessionFile: "/tmp/session.jsonl" });
		const bash = await pi.emitBash("pr-address exec get-feedback 123 --format json");

		expect(state.harnessSessionId).toBe("pi-session-file-29e67821bedc391a811d7fd8fcdf12be");
		expect(bash.command).toBe(
			"export HARNESS_SESSION_ID='pi-session-file-29e67821bedc391a811d7fd8fcdf12be'\npr-address exec get-feedback 123 --format json",
		);
		expect(bash.result).toBeUndefined();
	});

	test("restores an existing custom harness session id entry", async () => {
		const pi = new FakePi();
		register(pi);

		await pi.emitSessionStart({
			sessionFile: "/tmp/new-session.jsonl",
			entries: [
				{
					type: "custom",
					customType: "asdl-harness-session-id",
					data: { harnessSessionId: "restored-id" },
				},
			],
		});
		const bash = await pi.emitBash("echo ok");

		expect(bash.command).toBe("export HARNESS_SESSION_ID='restored-id'\necho ok");
	});

	test("generates and persists one ephemeral id when no session file exists", async () => {
		const pi = new FakePi();
		const state = register(pi);

		await pi.emitSessionStart();
		const bash = await pi.emitBash("echo ephemeral");

		expect(state.harnessSessionId).toBe("pi-ephemeral-1234-abc123");
		expect(pi.entries).toEqual([
			{
				type: "custom",
				customType: "asdl-harness-session-id",
				data: { harnessSessionId: "pi-ephemeral-1234-abc123" },
			},
		]);
		expect(bash.command).toBe(
			"export HARNESS_SESSION_ID='pi-ephemeral-1234-abc123'\necho ephemeral",
		);
	});

	test("does not double-prefix commands that already set HARNESS_SESSION_ID", async () => {
		const pi = new FakePi();
		register(pi);
		await pi.emitSessionStart({ sessionFile: "/tmp/session.jsonl" });

		await expect(
			pi.emitBash("HARNESS_SESSION_ID=manual pr-address exec get-feedback 123"),
		).resolves.toEqual({
			command: "HARNESS_SESSION_ID=manual pr-address exec get-feedback 123",
			result: undefined,
		});
		await expect(
			pi.emitBash("export HARNESS_SESSION_ID=manual\npr-address exec get-feedback 123"),
		).resolves.toEqual({
			command: "export HARNESS_SESSION_ID=manual\npr-address exec get-feedback 123",
			result: undefined,
		});
	});

	test("does not treat later shell text as a harness session override", async () => {
		const pi = new FakePi();
		register(pi);
		await pi.emitSessionStart({ sessionFile: "/tmp/session.jsonl" });

		await expect(pi.emitBash("echo HARNESS_SESSION_ID=manual")).resolves.toEqual({
			command:
				"export HARNESS_SESSION_ID='pi-session-file-29e67821bedc391a811d7fd8fcdf12be'\necho HARNESS_SESSION_ID=manual",
			result: undefined,
		});
	});

	test("blocks Bash calls before session_start initializes the harness session id", async () => {
		const pi = new FakePi();
		register(pi);

		const bash = await pi.emitBash("echo blocked");

		expect(bash.command).toBe("echo blocked");
		expect(bash.result).toEqual({
			block: true,
			reason: "HARNESS_SESSION_ID has not been initialized for this Pi session.",
		});
	});

	test("ignores non-Bash tool calls", async () => {
		const pi = new FakePi();
		register(pi);

		expect(await pi.emitReadTool()).toBeUndefined();
	});

	test("shellSingleQuote escapes single quotes", () => {
		expect(shellSingleQuote("a'b c")).toBe("'a'\\''b c'");
	});
});
