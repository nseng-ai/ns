import { describe, expect, test } from "vitest";

import { IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE } from "@nseng-ai/pi-runtime/commands/ack";
import type {
	CommandContext,
	CustomMessage,
	MessageRenderer,
	RawPiExecResult,
} from "@nseng-ai/pi-runtime/runtime/extension-types";

import smartRestackExtension, {
	SMART_RESTACK_COMMAND_NAME,
	buildResolverPrompt,
	runSmartRestack,
	type LoadRestackSkillBlock,
	type SmartRestackExtensionAPI,
} from "../../src/code-workflows/smart-restack.ts";
import type {
	RunSmartRestackPreflight,
	SmartRestackPreflightResult,
} from "../../src/code-workflows/restack-preflight.ts";
import { createTestSessionReader } from "../test-session-reader.ts";

interface ExecCall {
	command: string;
	args: string[];
	cwd?: string;
}

type RegisteredCommand = Parameters<SmartRestackExtensionAPI["registerCommand"]>[1];

class FakePi implements SmartRestackExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly execCalls: ExecCall[] = [];
	readonly messages: CustomMessage[] = [];
	readonly renderers = new Map<string, MessageRenderer>();
	readonly sentUserMessages: string[] = [];
	readonly events: string[];
	private readonly execResults: RawPiExecResult[];

	constructor(execResults: RawPiExecResult[] = [], events: string[] = []) {
		this.execResults = [...execResults];
		this.events = events;
	}

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	registerMessageRenderer(customType: string, renderer: MessageRenderer): void {
		this.renderers.set(customType, renderer);
	}

	sendMessage(message: CustomMessage): void {
		this.messages.push(message);
		this.events.push(`message:${message.customType}`);
	}

	async exec(
		command: string,
		args: string[],
		options?: { cwd?: string },
	): Promise<RawPiExecResult> {
		this.execCalls.push(
			options?.cwd === undefined ? { command, args } : { command, args, cwd: options.cwd },
		);
		this.events.push(`exec:${command} ${args.join(" ")}`);
		const result = this.execResults.shift();
		if (result === undefined) throw new Error(`unexpected exec: ${command} ${args.join(" ")}`);
		return result;
	}

	async sendUserMessage(content: string): Promise<void> {
		this.sentUserMessages.push(content);
		this.events.push("send-user-message");
	}
}

class FakeCommandContext implements CommandContext {
	readonly cwd: string;
	readonly mode = "tui";
	readonly hasUI: boolean;
	readonly notifications: Array<{
		message: string;
		level: "info" | "warning" | "error" | undefined;
	}> = [];
	readonly selectCalls: Array<{ title: string; options: string[] }> = [];
	readonly events: string[];
	readonly sessionManager = createTestSessionReader();
	readonly ui: CommandContext["ui"];

	constructor(
		options: {
			cwd?: string;
			hasUI?: boolean;
			withSelector?: boolean;
			selection?: string;
			events?: string[];
		} = {},
	) {
		this.cwd = options.cwd ?? "/repo";
		this.hasUI = options.hasUI ?? true;
		this.events = options.events ?? [];
		this.ui = {
			notify: (message, level) => {
				this.notifications.push({ message, level });
			},
			...(options.withSelector === false
				? {}
				: {
						select: async (title: string, selectOptions: string[]) => {
							this.selectCalls.push({ title, options: [...selectOptions] });
							return options.selection;
						},
					}),
		};
	}

	async waitForIdle(): Promise<void> {
		this.events.push("wait-for-idle");
	}
}

function rawResult(
	options: {
		code?: number;
		stdout?: string;
		stderr?: string;
	} = {},
): RawPiExecResult {
	return {
		code: options.code ?? 0,
		stdout: options.stdout ?? "",
		stderr: options.stderr ?? "",
	};
}

function preflight(
	result: SmartRestackPreflightResult,
	events?: string[],
): RunSmartRestackPreflight {
	return async () => {
		events?.push("preflight");
		return result;
	};
}

const loadSkillBlock: LoadRestackSkillBlock = async () => ({
	block: '<skill name="code-gt-restack-resolve">body</skill>',
});

async function run(options: {
	pi: FakePi;
	ctx?: FakeCommandContext;
	args?: string;
	preflightResult?: SmartRestackPreflightResult;
	loadSkill?: LoadRestackSkillBlock;
}): Promise<FakeCommandContext> {
	const ctx = options.ctx ?? new FakeCommandContext();
	await runSmartRestack({
		pi: options.pi,
		ctx,
		args: options.args ?? "",
		runPreflight: preflight(options.preflightResult ?? { type: "ready" }),
		loadSkillBlock: options.loadSkill ?? loadSkillBlock,
	});
	return ctx;
}

describe("smart restack extension registration", () => {
	test("registers the stable command and acknowledges before idle wait and command I/O", async () => {
		const events: string[] = [];
		const pi = new FakePi([rawResult({ stdout: "Already up to date\n" })], events);
		smartRestackExtension(pi, {
			runPreflight: preflight({ type: "ready" }, events),
			loadSkillBlock,
		});
		const command = pi.commands.get(SMART_RESTACK_COMMAND_NAME);
		if (command === undefined) throw new Error("missing command");
		const ctx = new FakeCommandContext({ events });

		await command.handler("", ctx);

		expect(SMART_RESTACK_COMMAND_NAME).toBe("code:gt-restack-resolve");
		expect(command).toMatchObject({
			description:
				"Run gt restack first; fall through to LM-assisted conflict resolution if needed",
			argumentHint: "[context for resolver if needed]",
		});
		expect(events.slice(0, 3)).toEqual([
			`message:${IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE}`,
			"wait-for-idle",
			"preflight",
		]);
		expect(events.indexOf(`message:${IMMEDIATE_COMMAND_ACK_MESSAGE_TYPE}`)).toBeLessThan(
			events.indexOf("exec:gt restack"),
		);
	});
});

describe("smart restack default preflight wiring", () => {
	test("runs the ns downstack preflight adapter before gt restack", async () => {
		const pi = new FakePi([
			rawResult({
				stdout: JSON.stringify({
					status: "ok",
					exitCode: 0,
					data: {
						clean: true,
						tracked: true,
						rebaseInProgress: false,
						hasUpstackChildren: true,
						requestedScope: "downstack",
						effectiveScope: "downstack",
						branches: ["feature/current"],
						slotConflicts: [],
						warnings: [],
					},
				}),
			}),
			rawResult({ stdout: "Already up to date\n" }),
		]);
		smartRestackExtension(pi, { loadSkillBlock });
		const command = pi.commands.get(SMART_RESTACK_COMMAND_NAME);
		if (command === undefined) throw new Error("missing command");

		await command.handler("", new FakeCommandContext());

		expect(pi.execCalls).toEqual([
			{
				command: "ns",
				args: [
					"slot",
					"gt",
					"exec",
					"restack-preflight",
					"--scope",
					"downstack",
					"--format",
					"json",
				],
				cwd: "/repo",
			},
			{ command: "gt", args: ["restack"], cwd: "/repo" },
		]);
	});

	test("surfaces preflight warnings without starting restack or the resolver", async () => {
		const pi = new FakePi([
			rawResult({
				code: 1,
				stdout: JSON.stringify({
					status: "negative",
					exitCode: 1,
					message: "Restack preflight is blocked.",
					data: {
						clean: true,
						tracked: true,
						rebaseInProgress: true,
						hasUpstackChildren: false,
						requestedScope: "full",
						effectiveScope: "downstack",
						branches: ["feature/current"],
						slotConflicts: [],
						warnings: ["full scope collapsed to downstack"],
					},
				}),
			}),
		]);
		smartRestackExtension(pi, { loadSkillBlock });
		const command = pi.commands.get(SMART_RESTACK_COMMAND_NAME);
		if (command === undefined) throw new Error("missing command");
		const ctx = new FakeCommandContext();

		await command.handler("", ctx);

		expect(pi.execCalls).toEqual([
			{
				command: "ns",
				args: [
					"slot",
					"gt",
					"exec",
					"restack-preflight",
					"--scope",
					"downstack",
					"--format",
					"json",
				],
				cwd: "/repo",
			},
		]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: expect.stringContaining("full scope collapsed to downstack"),
			level: "error",
		});
	});

	test("refuses failure-envelope rebase data without starting restack or the resolver", async () => {
		const pi = new FakePi([
			rawResult({
				code: 2,
				stdout: JSON.stringify({
					status: "failure",
					exitCode: 2,
					errorType: "inspection-failed",
					message: "preflight inspection failed",
					data: { rebaseInProgress: true },
				}),
			}),
		]);
		smartRestackExtension(pi, { loadSkillBlock });
		const command = pi.commands.get(SMART_RESTACK_COMMAND_NAME);
		if (command === undefined) throw new Error("missing command");
		const ctx = new FakeCommandContext();

		await command.handler("", ctx);

		expect(pi.execCalls).toEqual([
			{
				command: "ns",
				args: [
					"slot",
					"gt",
					"exec",
					"restack-preflight",
					"--scope",
					"downstack",
					"--format",
					"json",
				],
				cwd: "/repo",
			},
		]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: expect.stringContaining("preflight inspection failed"),
			level: "error",
		});
	});
});

describe("smart restack workflow", () => {
	test("rebase preflight skips gt restack and starts the resolver", async () => {
		const pi = new FakePi();

		await run({
			pi,
			args: "continue carefully",
			preflightResult: { type: "rebase-in-progress" },
		});

		expect(pi.execCalls).toEqual([]);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain(
			"structured downstack preflight already reported rebaseInProgress=true",
		);
		expect(pi.sentUserMessages[0]).toContain("continue carefully");
	});

	test("ready preflight runs the deterministic fast path and stops without an LM turn on success", async () => {
		const pi = new FakePi([rawResult({ stdout: "Already up to date\n" })]);

		const ctx = await run({ pi });

		expect(pi.execCalls).toEqual([{ command: "gt", args: ["restack"], cwd: "/repo" }]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toContain("No LM turn was started");
	});

	test("refused preflight never runs gt restack", async () => {
		const pi = new FakePi();

		const ctx = await run({
			pi,
			preflightResult: { type: "refused", message: "repository state is ambiguous" },
		});

		expect(pi.execCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications).toEqual([
			{ message: "repository state is ambiguous", level: "error" },
		]);
	});

	test("failed fast path starts the resolver only after explicit selection", async () => {
		const pi = new FakePi([rawResult({ code: 1, stderr: "CONFLICT\n" })]);
		const ctx = new FakeCommandContext({ selection: "Start LM resolver" });

		await run({ pi, ctx, args: "prefer parent stack" });

		expect(pi.execCalls).toEqual([{ command: "gt", args: ["restack"], cwd: "/repo" }]);
		expect(ctx.selectCalls).toEqual([
			{
				title: "gt restack needs help",
				options: ["Start LM resolver", "Leave rebase stopped", "Abort rebase"],
			},
		]);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain(
			"downstack preflight passed, then the deterministic /code:gt-restack-resolve fast path ran `gt restack`",
		);
		expect(pi.sentUserMessages[0]).toContain("prefer parent stack");
	});

	test("aborts rebase only after the explicit abort selection", async () => {
		const pi = new FakePi([rawResult({ code: 1, stderr: "CONFLICT\n" }), rawResult()]);
		const ctx = new FakeCommandContext({ selection: "Abort rebase" });

		await run({ pi, ctx });

		expect(pi.execCalls).toEqual([
			{ command: "gt", args: ["restack"], cwd: "/repo" },
			{ command: "git", args: ["rebase", "--abort"], cwd: "/repo" },
		]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toContain("Rebase aborted");
	});

	test.each([
		["Leave rebase stopped", "Rebase left stopped for manual handling."],
		[undefined, "Rebase left stopped for manual handling."],
		["Unexpected selection", "Unrecognized selection; rebase left stopped"],
	] as const)("selection %s leaves the failed rebase stopped", async (selection, expected) => {
		const pi = new FakePi([rawResult({ code: 1, stderr: "CONFLICT\n" })]);
		const ctx =
			selection === undefined ? new FakeCommandContext() : new FakeCommandContext({ selection });

		await run({ pi, ctx });

		expect(pi.execCalls).toEqual([{ command: "gt", args: ["restack"], cwd: "/repo" }]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toContain(expected);
	});

	test("failed fast path does not start a turn or abort without selection UI", async () => {
		const pi = new FakePi([rawResult({ code: 1, stderr: "failed\n" })]);
		const ctx = new FakeCommandContext({ hasUI: false, withSelector: false });

		await run({ pi, ctx });

		expect(pi.execCalls).toEqual([{ command: "gt", args: ["restack"], cwd: "/repo" }]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications).toEqual([
			{ message: "Running deterministic fast path: gt restack", level: "info" },
		]);
	});

	test("missing sendUserMessage fails safely without loading the skill", async () => {
		const pi = new FakePi();
		Object.defineProperty(pi, "sendUserMessage", { value: undefined });
		let loadCalls = 0;
		const ctx = new FakeCommandContext();

		await run({
			pi,
			ctx,
			preflightResult: { type: "rebase-in-progress" },
			loadSkill: async () => {
				loadCalls += 1;
				return { block: "unexpected" };
			},
		});

		expect(loadCalls).toBe(0);
		expect(ctx.notifications.at(-1)).toEqual({
			message:
				"Cannot start code-gt-restack-resolve: this Pi host does not expose sendUserMessage.",
			level: "error",
		});
	});

	test("skill expansion failure fails safely without sending a user message", async () => {
		const pi = new FakePi();
		const ctx = new FakeCommandContext();

		await run({
			pi,
			ctx,
			preflightResult: { type: "rebase-in-progress" },
			loadSkill: async () => {
				throw new Error("skill unavailable");
			},
		});

		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "Could not read code-gt-restack-resolve: skill unavailable",
			level: "error",
		});
	});
});

describe("resolver prompt", () => {
	test("preserves skill content and fences additional user context", () => {
		const prompt = buildResolverPrompt("<skill>body</skill>", "prefer `parent`", {
			type: "failed-fast-path",
		});

		expect(prompt).toContain("<skill>body</skill>");
		expect(prompt).toContain("Additional user-supplied context:");
		expect(prompt).toContain("prefer `parent`");
	});

	test("adds only the wrapper-owned inherited evidence", () => {
		const interrupted = buildResolverPrompt("<skill>body</skill>", "", {
			type: "interrupted-restack",
		});
		const failedFastPath = buildResolverPrompt("<skill>body</skill>", "", {
			type: "failed-fast-path",
		});

		expect(interrupted).toBe(
			"<skill>body</skill>\n\nInherited wrapper evidence: structured downstack preflight already reported rebaseInProgress=true.",
		);
		expect(failedFastPath).toBe(
			"<skill>body</skill>\n\nInherited wrapper evidence: downstack preflight passed, then the deterministic /code:gt-restack-resolve fast path ran `gt restack` and did not complete cleanly.",
		);
	});
});
