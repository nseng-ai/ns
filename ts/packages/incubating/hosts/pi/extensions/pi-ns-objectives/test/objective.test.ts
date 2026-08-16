import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";

import {
	ScriptedQueue,
	withTempGitRepo,
	withTempRepoSkill,
	type TempRepoSkill,
} from "@nseng-ai/foundation/test-kit";
import { createManualClock } from "@nseng-ai/foundation/time/testing";
import type {
	ObjectiveClient,
	ObjectiveListResult,
	ObjectiveSelectionContext,
	ObjectiveSelectionListLoadResult,
	ObjectiveSelectionSpec,
} from "@nseng-ai/objectives/api";
import { CLI_COMMAND_OUTPUT_MESSAGE_TYPE } from "@nseng-ai/pi-runtime/commands/cli-extension";
import objectiveExtension, {
	extractSingleProposedPrompt,
	type CommandContext,
	type RawPiExecResult,
	type ObjectiveExtensionAPI,
	type NotifyLevel,
} from "../src/extension.ts";
import { createTestSessionReader } from "./test-session-reader.ts";

type RawPiExecResultFixture = Partial<RawPiExecResult>;
import type {
	AgentEndContext,
	AgentEndEventLike,
	AgentSettledContext,
	RawPiExecOptions,
	SessionStartContext,
	SessionStartEventLike,
	EffectiveSkillInfo,
} from "@nseng-ai/pi-runtime/runtime/types";

const ROOT = process.cwd();
const TRUNK = "master";
const NOW = Date.parse("2026-01-15T00:00:00Z");

const OBJECTIVE_COMMAND_NAMES = [
	"ns:objective:next",
	"ns:objective:update",
	"ns:objective:close",
	"ns:objective:autorun",
] as const;
type ObjectiveCommandName = (typeof OBJECTIVE_COMMAND_NAMES)[number];
type ObjectiveSkillName =
	| "objective-next"
	| "objective-update"
	| "objective-close"
	| "objective-autorun";

const OBJECTIVE_SKILLS_BY_COMMAND: Record<ObjectiveCommandName, ObjectiveSkillName> = {
	"ns:objective:next": "objective-next",
	"ns:objective:update": "objective-update",
	"ns:objective:close": "objective-close",
	"ns:objective:autorun": "objective-autorun",
};

const LEGACY_OBJECTIVE_LIST_COMMAND_NAME = ["objective", ":", "list"].join("");

const COMMAND_SKILL_NAMES = OBJECTIVE_SKILLS_BY_COMMAND;

const ACTION_PROMPTS: Record<ObjectiveCommandName, string> = {
	"ns:objective:next": "Run objective-next for this explicitly selected Objective slug or path:",
	"ns:objective:update":
		"Run objective-update for this explicitly selected Objective slug or path:",
	"ns:objective:close": "Run objective-close for this explicitly selected Objective slug or path:",
	"ns:objective:autorun":
		"Run objective-autorun with this Objective selection and launch scope (slug/path plus optional scope, step budget, and standing guidance):",
};

type RegisteredCommand = Parameters<ObjectiveExtensionAPI["registerCommand"]>[1];
type MessageRenderer = Parameters<NonNullable<ObjectiveExtensionAPI["registerMessageRenderer"]>>[1];

interface ExecCall {
	command: string;
	args: string[];
	options: RawPiExecOptions | undefined;
}

interface ScriptedExec {
	command: string;
	args: string[];
	result: RawPiExecResultFixture | undefined;
	error?: unknown;
}

interface Notification {
	message: string;
	level: NotifyLevel | undefined;
}

interface Selection {
	title: string;
	items: string[];
}

interface SentUserMessage {
	content: string;
	options: { deliverAs?: "steer" | "followUp" } | undefined;
}

type EventName = "agent_end" | "agent_settled" | "input" | "session_start";
type AgentEndHandler = (event: AgentEndEventLike, ctx: AgentEndContext) => Promise<void> | void;
type AgentSettledHandler = (_event: unknown, ctx: AgentSettledContext) => Promise<void> | void;
type InputHandler = (event: {
	text: string;
	source: "interactive" | "rpc" | "extension";
}) => Promise<void> | void;
type SessionStartHandler = (
	_event: SessionStartEventLike,
	ctx: SessionStartContext,
) => Promise<void> | void;

class FakePi implements ObjectiveExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly execCalls: ExecCall[] = [];
	readonly messageRenderers = new Map<string, MessageRenderer>();
	readonly sentMessages: Parameters<NonNullable<ObjectiveExtensionAPI["sendMessage"]>>[0][] = [];
	readonly sentUserMessages: string[] = [];
	readonly sentUserMessageCalls: SentUserMessage[] = [];
	readonly sendMessage = (
		message: Parameters<NonNullable<ObjectiveExtensionAPI["sendMessage"]>>[0],
	): void => {
		this.sentMessages.push(message);
	};
	private readonly script: ScriptedQueue<ScriptedExec>;
	private readonly eventHandlers: Record<
		EventName,
		Array<AgentEndHandler | AgentSettledHandler | InputHandler | SessionStartHandler>
	> = {
		agent_end: [],
		agent_settled: [],
		input: [],
		session_start: [],
	};

	constructor(script: ScriptedExec[] = []) {
		this.script = new ScriptedQueue(script, (step) => step);
	}

	on(event: "agent_end", handler: AgentEndHandler): void;
	on(event: "agent_settled", handler: AgentSettledHandler): void;
	on(event: "input", handler: InputHandler): void;
	on(event: "session_start", handler: SessionStartHandler): void;
	on(
		event: EventName,
		handler: AgentEndHandler | AgentSettledHandler | InputHandler | SessionStartHandler,
	): void {
		this.eventHandlers[event].push(handler);
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	registerMessageRenderer(customType: string, renderer: MessageRenderer): void {
		this.messageRenderers.set(customType, renderer);
	}

	async exec(
		command: string,
		args: string[],
		options?: RawPiExecOptions,
	): Promise<RawPiExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const missingStepMessage = `unexpected exec: ${command} ${args.join(" ")}`;
		const expected = this.script.shiftOrRecordError(missingStepMessage);
		if (expected === undefined) {
			return execResult({ code: 99, stderr: missingStepMessage });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.script.recordError(message);
			return execResult({ code: 99, stderr: message });
		}

		if (expected.error) {
			throw expected.error;
		}

		return execResult(expected.result);
	}

	async loadObjectiveList(
		_ctx: ObjectiveSelectionContext,
		_spec: ObjectiveSelectionSpec,
	): Promise<ObjectiveSelectionListLoadResult> {
		const missingStepMessage = "unexpected objective list load";
		const expected = this.script.shiftOrRecordError(missingStepMessage);
		if (expected === undefined) {
			return { type: "failed", message: missingStepMessage };
		}
		if (
			expected.command !== "objective" ||
			!sameArgs(expected.args, ["list", "--format", "json"])
		) {
			const message = `expected objective list step, got ${expected.command} ${expected.args.join(" ")}`;
			this.script.recordError(message);
			return { type: "failed", message };
		}
		if (expected.error) {
			return { type: "failed", message: String(expected.error) };
		}
		try {
			const envelope = JSON.parse(expected.result?.stdout ?? "");
			return { type: "loaded", list: envelope.data as ObjectiveListResult };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { type: "failed", message: `Malformed objective list JSON: ${message}` };
		}
	}

	sendUserMessage(content: string, options?: { deliverAs?: "steer" | "followUp" }): void {
		this.sentUserMessages.push(content);
		this.sentUserMessageCalls.push({ content, options });
	}

	async emitAgentEnd(event: AgentEndEventLike, ctx: AgentEndContext): Promise<void> {
		for (const handler of this.eventHandlers.agent_end) {
			await (handler as AgentEndHandler)(event, ctx);
		}
	}

	async emitInput(
		text: string,
		source: "interactive" | "rpc" | "extension" = "interactive",
	): Promise<void> {
		for (const handler of this.eventHandlers.input) {
			await (handler as InputHandler)({ text, source });
		}
	}

	async emitAgentSettled(ctx: AgentSettledContext): Promise<void> {
		for (const handler of this.eventHandlers.agent_settled) {
			await (handler as AgentSettledHandler)({}, ctx);
		}
	}

	async emitSessionStart(ctx: SessionStartContext): Promise<void> {
		for (const handler of this.eventHandlers.session_start) {
			await (handler as SessionStartHandler)({ reason: "startup" }, ctx);
		}
	}

	assertDone(): void {
		this.script.assertDone();
	}
}

function createAgentContext(
	options: {
		hasUI?: boolean;
		select?: (title: string, items: string[]) => Promise<string | undefined>;
		setEditorText?: (value: string) => void;
	} = {},
): AgentSettledContext {
	return {
		hasUI: options.hasUI ?? true,
		ui: {
			notify(): void {},
			...(options.select === undefined ? {} : { select: options.select }),
			...(options.setEditorText === undefined ? {} : { setEditorText: options.setEditorText }),
		},
	};
}

function assistantEvent(text: string): AgentEndEventLike {
	return {
		messages: [
			{ role: "user", content: [{ type: "text", text: "request" }] },
			{ role: "assistant", content: [{ type: "text", text }] },
		],
	};
}

const PROPOSED_PROMPT_PACKET = `Decision packet

## ▶ Proposed prompt — ready to run

> First line${"  "}
>
> Last line

---
Ignored afterward`;

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function execResult(overrides: RawPiExecResultFixture = {}): RawPiExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

function step(command: string, args: string[], result?: RawPiExecResultFixture): ScriptedExec {
	return { command, args, result };
}

function createContext(
	options: {
		cancelSelect?: boolean;
		cwd?: string;
		selectIndex?: number;
		selectIndices?: number[];
		skills?: readonly EffectiveSkillInfo[];
	} = {},
): {
	ctx: CommandContext;
	notifications: Notification[];
	selections: Selection[];
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	const selections: Selection[] = [];
	let waits = 0;

	const ctx: CommandContext = {
		cwd: options.cwd ?? ROOT,
		hasUI: true,
		modelRegistry: {
			find: () => undefined,
		},
		sessionManager: createTestSessionReader(),
		getSystemPromptOptions: () => ({ skills: options.skills ?? [] }),
		ui: {
			notify(message: string, level?: NotifyLevel): void {
				notifications.push({ message, level });
			},
			async select(title: string, items: string[]): Promise<string | undefined> {
				const callIndex = selections.length;
				selections.push({ title, items: [...items] });
				if (options.cancelSelect) {
					return undefined;
				}
				return items[options.selectIndices?.[callIndex] ?? options.selectIndex ?? 0];
			},
			setStatus(): void {},
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};

	return { ctx, notifications, selections, waitForIdleCalls: () => waits };
}

const AUTORUN_SKILL_MARKDOWN = `---
name: objective-autorun
hidden-frontmatter-token: do-not-include
---

# Test Objective Autorun Skill

Supports \`portable\` parent-verified commits and \`ns-bookended\` runner-attested checkpoints.
Preview and confirm the selected mode before launch.
Use the selected Objective.
`;

function withAutorunSkill<T>(callback: (skill: TempRepoSkill) => Promise<T>): Promise<T> {
	return withTempRepoSkill(
		{
			skillName: "objective-autorun",
			markdown: AUTORUN_SKILL_MARKDOWN,
			prefix: "objective-autorun-",
		},
		callback,
	);
}

function repoObjectiveSkill(skillName: ObjectiveSkillName): EffectiveSkillInfo {
	const filePath = join(ROOT, "..", ".agents", "skills", skillName, "SKILL.md");
	return effectiveSkill(skillName, filePath, dirname(filePath));
}

function effectiveSkill(name: string, filePath: string, baseDir: string): EffectiveSkillInfo {
	return { name, filePath, baseDir };
}

type ObjectiveCommandContextOptions = {
	cancelSelect?: boolean;
	selectIndex?: number;
	selectIndices?: number[];
	cwd?: string;
};

interface RunObjectiveListOptions {
	script?: ScriptedExec[];
	contextOptions?: ObjectiveCommandContextOptions;
	objectiveClient?: ObjectiveClient;
}

async function runObjectiveAutorun(
	args: string,
	script: ScriptedExec[] = [],
	contextOptions: ObjectiveCommandContextOptions = {},
	skills?: EffectiveSkillInfo[],
): Promise<{
	pi: FakePi;
	notifications: Notification[];
	selections: Selection[];
	waitForIdleCalls: () => number;
}> {
	const effectiveSkills = skills ?? [repoObjectiveSkill("objective-autorun")];
	const pi = new FakePi(script);
	objectiveExtension(pi, { clock: createManualClock(NOW).clock });
	const command = pi.commands.get("ns:objective:autorun");
	expect(command).toBeDefined();
	if (!command) {
		throw new Error("ns:objective:autorun was not registered");
	}

	const skillPath = effectiveSkills[0]?.filePath;
	const context = createContext({
		...contextOptions,
		skills: effectiveSkills,
		...(contextOptions.cwd === undefined && skillPath !== undefined
			? { cwd: dirname(dirname(dirname(skillPath))) }
			: {}),
	});
	await command.handler(args, context.ctx);
	return { pi, ...context };
}

async function runObjectiveNext(
	args: string,
	script: ScriptedExec[],
	contextOptions: ObjectiveCommandContextOptions = {},
): Promise<{
	pi: FakePi;
	notifications: Notification[];
	selections: Selection[];
	waitForIdleCalls: () => number;
}> {
	const pi = new FakePi(script);
	objectiveExtension(pi, { clock: createManualClock(NOW).clock });
	const command = pi.commands.get("ns:objective:next");
	expect(command).toBeDefined();
	const context = createContext({
		...contextOptions,
		skills: [repoObjectiveSkill("objective-next")],
	});
	await command?.handler(args, context.ctx);
	return { pi, ...context };
}

interface RunObjectiveCommandOptions {
	commandName: ObjectiveCommandName;
	args: string;
	script?: ScriptedExec[];
	contextOptions?: ObjectiveCommandContextOptions;
	skills?: EffectiveSkillInfo[];
}

async function runObjectiveCommand(options: RunObjectiveCommandOptions): Promise<{
	pi: FakePi;
	notifications: Notification[];
	selections: Selection[];
	waitForIdleCalls: () => number;
}> {
	const effectiveSkills = options.skills ?? [
		repoObjectiveSkill(COMMAND_SKILL_NAMES[options.commandName]),
	];
	const pi = new FakePi(options.script ?? []);
	objectiveExtension(pi, { clock: createManualClock(NOW).clock });
	const command = pi.commands.get(options.commandName);
	expect(command).toBeDefined();
	if (!command) {
		throw new Error(`${options.commandName} was not registered`);
	}

	const skillPath = effectiveSkills[0]?.filePath;
	const contextOptions = options.contextOptions ?? {};
	const context = createContext({
		...contextOptions,
		skills: effectiveSkills,
		...(contextOptions.cwd === undefined && skillPath !== undefined
			? { cwd: dirname(dirname(dirname(skillPath))) }
			: {}),
	});
	await command.handler(options.args, context.ctx);
	return { pi, ...context };
}

async function runObjectiveList(
	args: string,
	options: RunObjectiveListOptions = {},
): Promise<{
	pi: FakePi;
	notifications: Notification[];
	selections: Selection[];
	waitForIdleCalls: () => number;
}> {
	const pi = new FakePi(options.script ?? []);
	const { objectiveClient } = options;
	objectiveExtension(
		pi,
		objectiveClient === undefined ? {} : { createObjectiveClient: () => objectiveClient },
	);
	const command = pi.commands.get("ns:objective:list");
	expect(command).toBeDefined();
	if (!command) {
		throw new Error("ns:objective:list was not registered");
	}

	const context = createContext(options.contextOptions ?? {});
	await command.handler(args, context.ctx);
	return { pi, ...context };
}

function expectNoObjectiveListExec(result: { pi: FakePi }): void {
	expect(
		result.pi.execCalls.some((call) => call.command === "objective" && call.args[0] === "list"),
	).toBe(false);
}

function expectPromptSelectsObjective(
	commandName: ObjectiveCommandName,
	prompt: string | undefined,
	objective: string,
): void {
	expect(prompt).toContain(ACTION_PROMPTS[commandName]);
	expect(prompt).toContain(`\`\`\`text\n${objective}\n\`\`\``);
	expect(prompt).toContain(
		"Treat this as an explicit user selection. Do not auto-select a different Objective.",
	);
}

function objectiveList(slugs: string[], trunkBranch: string = TRUNK): string {
	return objectiveListFromRecords(
		slugs.map((slug, index) => ({
			slug,
			status: "open",
			latestUpdateIso: `2026-01-0${index + 1}T00:00:00Z`,
		})),
		trunkBranch,
	);
}

function objectiveListFromRecords(
	records: Array<{
		slug: string;
		status: string;
		latestUpdateIso: string | null;
		isBlocked?: boolean;
	}>,
	trunkBranch: string = TRUNK,
): string {
	return JSON.stringify({
		status: "ok",
		exitCode: 0,
		data: {
			trunkBranch: trunkBranch,
			rootPath: ".ns/objectives",
			statusFilter: "active",
			namesOnly: false,
			records: records.map((record) => ({
				slug: record.slug,
				status: record.status,
				latestUpdateIso: record.latestUpdateIso,
				...(record.isBlocked === true ? { isBlocked: true } : {}),
				hasOutstandingChanges: false,
			})),
		},
	});
}

function listStep(slugs: string[], trunkBranch: string = TRUNK): ScriptedExec {
	return step("objective", ["list", "--format", "json"], {
		stdout: objectiveList(slugs, trunkBranch),
	});
}

function objectiveCandidatesFromRecords(records: Array<{ slug: string; status: string }>): string {
	return JSON.stringify({
		status: "ok",
		exitCode: 0,
		data: {
			records,
		},
	});
}

function candidateStep(slugs: string[]): ScriptedExec {
	return step("ns", ["objective", "exec", "list-candidates", "--format", "json"], {
		stdout: objectiveCandidatesFromRecords(slugs.map((slug) => ({ slug, status: "open" }))),
	});
}

function diffStep(stdout: string, result: RawPiExecResultFixture = {}): ScriptedExec {
	return step("git", ["diff", "--name-status", "-M", `${TRUNK}...HEAD`, "--", ".ns/objectives"], {
		stdout,
		...result,
	});
}

function statusStep(stdout: string, result: RawPiExecResultFixture = {}): ScriptedExec {
	return step("git", ["status", "--porcelain=v1", "-z", "--", ".ns/objectives"], {
		stdout,
		...result,
	});
}

function fakeObjectiveListClient(
	listObjectives: ObjectiveClient["listObjectives"],
): ObjectiveClient {
	return {
		listObjectives,
		async readObjective() {
			throw new Error("unexpected readObjective call");
		},
		async listActiveCandidates() {
			throw new Error("unexpected listActiveCandidates call");
		},
	};
}

async function objectiveCommandCompletions(
	commandName: ObjectiveCommandName,
	prefix: string,
	script: ScriptedExec[],
): Promise<{
	pi: FakePi;
	items: Awaited<ReturnType<NonNullable<RegisteredCommand["getArgumentCompletions"]>>>;
}> {
	const pi = new FakePi(script);
	objectiveExtension(pi);
	await pi.emitSessionStart(createContext().ctx);
	const command = pi.commands.get(commandName);
	expect(typeof command?.getArgumentCompletions).toBe("function");
	if (!command?.getArgumentCompletions) {
		throw new Error(`${commandName} did not register argument completions`);
	}
	const items = await command.getArgumentCompletions(prefix);
	return { pi, items };
}

describe("objective-next proposed-prompt chooser", () => {
	test.each([
		["zero headings", "ordinary response", undefined],
		[
			"two headings",
			`${PROPOSED_PROMPT_PACKET}\n## ▶ Proposed prompt — ready to run\n> second`,
			undefined,
		],
		["no blockquote", "## ▶ Proposed prompt — ready to run\nplain", undefined],
		["declined packet", "## Declined\nNo next prompt.", undefined],
	] as const)("extracts no prompt for %s", (_name, text, expected) => {
		expect(extractSingleProposedPrompt(text)).toBe(expected);
	});

	test("extracts only the railed prompt and preserves its interior bytes", () => {
		expect(extractSingleProposedPrompt(PROPOSED_PROMPT_PACKET)).toBe("First line  \n\nLast line");
	});

	test("executes the final assistant message's extracted prompt as a follow-up", async () => {
		const pi = new FakePi();
		objectiveExtension(pi);
		await pi.emitInput("/skill:objective-next");
		const selections: Selection[] = [];
		const ctx = createAgentContext({
			select: async (title, items) => {
				selections.push({ title, items: [...items] });
				return "Execute it now";
			},
		});

		await pi.emitAgentEnd(assistantEvent(PROPOSED_PROMPT_PACKET), ctx);
		await pi.emitAgentSettled(ctx);

		expect(selections).toEqual([
			{
				title: "What would you like to do with the proposed prompt?",
				items: ["Execute it now", "Put it in input area", "I’ll do it myself, thank you"],
			},
		]);
		expect(pi.sentUserMessageCalls).toEqual([
			{
				content: "First line  \n\nLast line",
				options: { deliverAs: "followUp" },
			},
		]);
	});

	test.each([true, false])(
		"handles editor selection with editor available: %s",
		async (available) => {
			const pi = new FakePi();
			objectiveExtension(pi);
			await pi.emitInput("/skill:objective-next bravo");
			const editorValues: string[] = [];
			const ctx = createAgentContext({
				select: async () => "Put it in input area",
				...(available ? { setEditorText: (value: string) => editorValues.push(value) } : {}),
			});

			await pi.emitAgentEnd(assistantEvent(PROPOSED_PROMPT_PACKET), ctx);
			await pi.emitAgentSettled(ctx);

			expect(editorValues).toEqual(available ? ["First line  \n\nLast line"] : []);
			expect(pi.sentUserMessageCalls).toEqual([]);
		},
	);

	test.each(["I’ll do it myself, thank you", undefined] as const)(
		"takes no action for dismissal selection %s",
		async (selection) => {
			const pi = new FakePi();
			objectiveExtension(pi);
			await pi.emitInput("/skill:objective-next");
			const ctx = createAgentContext({ select: async () => selection });
			await pi.emitAgentEnd(assistantEvent(PROPOSED_PROMPT_PACKET), ctx);
			await pi.emitAgentSettled(ctx);
			expect(pi.sentUserMessageCalls).toEqual([]);
		},
	);

	test.each([
		["no UI", createAgentContext({ hasUI: false })],
		["no selector", createAgentContext()],
	] as const)("stays recommendation-only with %s", async (_name, ctx) => {
		const pi = new FakePi();
		objectiveExtension(pi);
		await pi.emitInput("/skill:objective-next");
		await pi.emitAgentEnd(assistantEvent(PROPOSED_PROMPT_PACKET), ctx);
		await pi.emitAgentSettled(ctx);
		expect(pi.sentUserMessageCalls).toEqual([]);
	});

	test("clears pending state after settlement", async () => {
		const pi = new FakePi();
		objectiveExtension(pi);
		await pi.emitInput("/skill:objective-next");
		let offers = 0;
		const ctx = createAgentContext({
			select: async () => {
				offers += 1;
				return undefined;
			},
		});
		await pi.emitAgentEnd(assistantEvent(PROPOSED_PROMPT_PACKET), ctx);
		await pi.emitAgentSettled(ctx);
		await pi.emitAgentSettled(ctx);
		expect(offers).toBe(1);
	});

	test("the latest agent end overwrites an earlier qualifying capture", async () => {
		const pi = new FakePi();
		objectiveExtension(pi);
		await pi.emitInput("/skill:objective-next");
		let offers = 0;
		const ctx = createAgentContext({
			select: async () => {
				offers += 1;
				return undefined;
			},
		});
		await pi.emitAgentEnd(assistantEvent(PROPOSED_PROMPT_PACKET), ctx);
		await pi.emitAgentEnd(assistantEvent("non-qualifying retry"), ctx);
		await pi.emitAgentSettled(ctx);
		expect(offers).toBe(0);
	});

	test("offers identical qualifying prompts in separate cycles", async () => {
		const pi = new FakePi();
		objectiveExtension(pi);
		let offers = 0;
		const ctx = createAgentContext({
			select: async () => {
				offers += 1;
				return undefined;
			},
		});
		for (let cycle = 0; cycle < 2; cycle += 1) {
			await pi.emitInput("/skill:objective-next");
			await pi.emitAgentEnd(assistantEvent(PROPOSED_PROMPT_PACKET), ctx);
			await pi.emitAgentSettled(ctx);
		}
		expect(offers).toBe(2);
	});

	test("offers matching output after an explicit ns:objective:next invocation", async () => {
		const result = await runObjectiveCommand({
			commandName: "ns:objective:next",
			args: "bravo",
		});
		let offers = 0;
		const ctx = createAgentContext({
			select: async () => {
				offers += 1;
				return undefined;
			},
		});

		await result.pi.emitAgentEnd(assistantEvent(PROPOSED_PROMPT_PACKET), ctx);
		await result.pi.emitAgentSettled(ctx);

		expect(offers).toBe(1);
	});

	test("ignores matching output outside an explicit objective-next invocation", async () => {
		const pi = new FakePi();
		objectiveExtension(pi);
		let offers = 0;
		const ctx = createAgentContext({
			select: async () => {
				offers += 1;
				return undefined;
			},
		});

		await pi.emitAgentEnd(assistantEvent(PROPOSED_PROMPT_PACKET), ctx);
		await pi.emitAgentSettled(ctx);
		await pi.emitInput("Explain ## ▶ Proposed prompt — ready to run");
		await pi.emitAgentEnd(assistantEvent(PROPOSED_PROMPT_PACKET), ctx);
		await pi.emitAgentSettled(ctx);

		expect(offers).toBe(0);
	});
});

describe("ns:objective:list command", () => {
	test("renders accepted status arguments through the Objective Extension API", async () => {
		const listRequests: unknown[] = [];
		const objectiveClient = fakeObjectiveListClient(async (request) => {
			listRequests.push(request);
			return {
				ok: true,
				result: {
					trunkBranch: "main",
					rootPath: ".ns/objectives",
					statusFilter: "all",
					namesOnly: true,
					records: [
						{
							slug: "alpha",
							status: "open",
							latestUpdateIso: "2026-05-20T10:00:00Z",
							hasOutstandingChanges: false,
						},
					],
				},
			};
		});
		const result = await runObjectiveList("--names --status all", { objectiveClient });

		result.pi.assertDone();
		expect(listRequests).toEqual([{ names: true, status: "all" }]);
		expect(result.pi.execCalls).toEqual([]);
		expect(result.pi.messageRenderers.has(CLI_COMMAND_OUTPUT_MESSAGE_TYPE)).toBe(true);
		expect(result.pi.sentMessages[0]).toMatchObject({
			customType: CLI_COMMAND_OUTPUT_MESSAGE_TYPE,
			content: "alpha\n",
			details: {
				argv: ["list", "--names", "--status", "all"],
			},
		});
	});

	test("renders help without invoking objective list", async () => {
		const result = await runObjectiveList("--help");

		result.pi.assertDone();
		expect(result.pi.execCalls).toEqual([]);
		expect(result.pi.sentMessages[0]).toMatchObject({
			customType: CLI_COMMAND_OUTPUT_MESSAGE_TYPE,
		});
		expect(result.pi.sentMessages[0]?.content).toContain("Usage: /ns:objective:list");
	});

	test("rejects removed and adapter-owned flags before invoking objective list", async () => {
		const current = await runObjectiveList("--current");
		const view = await runObjectiveList("--view detail");
		const format = await runObjectiveList("--format json");
		const jsonSchema = await runObjectiveList("--json-schema");

		expect(current.pi.execCalls).toEqual([]);
		expect(view.pi.execCalls).toEqual([]);
		expect(format.pi.execCalls).toEqual([]);
		expect(jsonSchema.pi.execCalls).toEqual([]);
		expect(current.pi.sentMessages[0]?.content).toContain("--current is no longer supported");
		expect(view.pi.sentMessages[0]?.content).toContain("--view is no longer supported");
		expect(format.pi.sentMessages[0]?.content).toContain("--format is controlled");
		expect(jsonSchema.pi.sentMessages[0]?.content).toContain("--json-schema is not supported");
	});

	test("registers objective list argument completions through the bridge", async () => {
		const pi = new FakePi();
		objectiveExtension(pi);
		const command = pi.commands.get("ns:objective:list");
		expect(command?.getArgumentCompletions?.("--status ")).toEqual([
			{ value: "all", label: "all" },
			{ value: "active", label: "active" },
			{ value: "open", label: "open" },
			{ value: "closed", label: "closed" },
		]);
	});
});

test("does not register removed Objective commands", () => {
	const pi = new FakePi();
	const removedStackCommand = ["objective", ["gt", "stacks"].join("-")].join(":");

	objectiveExtension(pi);

	expect(pi.commands.has(removedStackCommand)).toBe(false);
	expect(pi.commands.has(LEGACY_OBJECTIVE_LIST_COMMAND_NAME)).toBe(false);
	expect(pi.commands.has("objective:current")).toBe(false);
});

describe("ns:objective:autorun command", () => {
	test("registers the skill-backed wrapper command", () => {
		const pi = new FakePi();

		objectiveExtension(pi);

		expect(pi.commands.has("ns:objective:autorun")).toBe(true);
	});

	test("explicit slug bypasses objective list, git evidence, and recursive slash dispatch", async () => {
		await withAutorunSkill(async ({ skillPath, skillDir }) => {
			const result = await runObjectiveAutorun("  bravo  ", [], {}, [
				effectiveSkill("objective-autorun", skillPath, skillDir),
			]);

			result.pi.assertDone();
			expect(result.pi.execCalls).toEqual([]);
			expect(result.selections).toEqual([]);
			expect(result.waitForIdleCalls()).toBe(1);
			expect(result.pi.sentUserMessages).toHaveLength(1);
			expect(result.pi.sentUserMessages[0]).toContain(
				`<skill name="objective-autorun" location="${skillPath}">`,
			);
			expect(result.pi.sentUserMessages[0]).toContain(
				"Supports `portable` parent-verified commits and `ns-bookended` runner-attested checkpoints.",
			);
			expect(result.pi.sentUserMessages[0]).toContain(
				"Preview and confirm the selected mode before launch.",
			);
			expect(result.pi.sentUserMessages[0]).not.toContain("hidden-frontmatter-token");
			expect(result.pi.sentUserMessages[0]).toContain(ACTION_PROMPTS["ns:objective:autorun"]);
			expect(result.pi.sentUserMessages[0]).not.toContain("objective_runner_step");
			expect(result.pi.sentUserMessages[0]).toContain(
				"Treat this as an explicit user selection. Do not auto-select a different Objective.",
			);
			expect(result.pi.sentUserMessages[0]).toContain("```text\nbravo\n```");
			expect(result.pi.sentUserMessages[0]?.startsWith("/ns:objective:autorun")).toBe(false);
			expect(result.notifications).toContainEqual({
				message: "Invoking objective-autorun for bravo.",
				level: "info",
			});
		});
	});

	test("missing required skill stops before picker, list, and git preparation", async () => {
		await withTempGitRepo({ prefix: "objective-autorun-preflight-" }, async ({ repoDir }) => {
			const result = await runObjectiveAutorun("", [], { cwd: repoDir }, []);

			result.pi.assertDone();
			expect(result.pi.execCalls).toEqual([]);
			expect(result.selections).toEqual([]);
			expect(result.pi.sentUserMessages).toEqual([]);
			expect(result.notifications[0]?.message).toContain(
				'Could not load required skill "objective-autorun"',
			);
		});
	});

	test("empty args load active candidates with objective list json and git evidence", async () => {
		await withAutorunSkill(async ({ skillPath, skillDir }) => {
			const result = await runObjectiveAutorun(
				"",
				[listStep(["alpha", "bravo"]), diffStep(""), statusStep("")],
				{},
				[effectiveSkill("objective-autorun", skillPath, skillDir)],
			);

			result.pi.assertDone();
			expectNoObjectiveListExec(result);
			expect(result.pi.execCalls[0]).toMatchObject({
				command: "git",
				args: ["diff", "--name-status", "-M", "master...HEAD", "--", ".ns/objectives"],
				options: { cwd: dirname(dirname(dirname(skillPath))) },
			});
			expect(result.pi.execCalls[0]?.options?.signal).toBeInstanceOf(AbortSignal);
			expect(result.pi.execCalls[0]?.options?.timeout).toBeUndefined();
			expect(result.pi.execCalls[1]).toMatchObject({
				command: "git",
				args: ["status", "--porcelain=v1", "-z", "--", ".ns/objectives"],
				options: { cwd: dirname(dirname(dirname(skillPath))) },
			});
			expect(result.pi.execCalls[1]?.options?.signal).toBeInstanceOf(AbortSignal);
			expect(result.pi.execCalls[1]?.options?.timeout).toBeUndefined();
			expect(result.waitForIdleCalls()).toBe(2);
			expect(result.pi.sentUserMessages[0]).toContain("```text\nalpha\n```");
		});
	});

	test("changed Objective grouping matches objective-next", async () => {
		await withAutorunSkill(async ({ skillPath, skillDir }) => {
			const result = await runObjectiveAutorun(
				"",
				[
					listStep(["alpha", "bravo", "charlie"]),
					diffStep("M\t.ns/objectives/bravo/objective.md\n"),
					statusStep(""),
				],
				{},
				[effectiveSkill("objective-autorun", skillPath, skillDir)],
			);

			result.pi.assertDone();
			expect(result.selections[0]).toEqual({
				title: "Select an active Objective to autorun (only Objective changed vs master)",
				items: [
					"bravo — suggested: only Objective changed vs master — open — latest update 2 weeks ago",
					"View other active Objectives…",
				],
			});
			expect(result.pi.sentUserMessages[0]).toContain("```text\nbravo\n```");
		});
	});

	test("empty args hide blocked Objectives from autorun picker menus", async () => {
		await withAutorunSkill(async ({ skillPath, skillDir }) => {
			const result = await runObjectiveAutorun(
				"",
				[
					step("objective", ["list", "--format", "json"], {
						stdout: objectiveListFromRecords([
							{ slug: "alpha", status: "open", latestUpdateIso: "2026-01-01T00:00:00Z" },
							{
								slug: "bravo",
								status: "open",
								latestUpdateIso: "2026-01-02T00:00:00Z",
								isBlocked: true,
							},
						]),
					}),
					diffStep(""),
					statusStep(""),
				],
				{},
				[effectiveSkill("objective-autorun", skillPath, skillDir)],
			);

			result.pi.assertDone();
			expect(result.selections[0]?.items).toEqual(["alpha — open — latest update 2 weeks ago"]);
			expect(result.pi.sentUserMessages[0]).toContain("```text\nalpha\n```");
		});
	});

	test("View other active Objectives opens a second picker and sends the selected other slug", async () => {
		await withAutorunSkill(async ({ skillPath, skillDir }) => {
			const result = await runObjectiveAutorun(
				"",
				[
					listStep(["alpha", "bravo", "charlie"]),
					diffStep("M\t.ns/objectives/bravo/objective.md\n"),
					statusStep(""),
				],
				{ selectIndices: [1, 1] },
				[effectiveSkill("objective-autorun", skillPath, skillDir)],
			);

			result.pi.assertDone();
			expect(result.selections[1]).toEqual({
				title: "Select an active Objective to autorun (other active Objectives)",
				items: [
					"alpha — open — latest update 2 weeks ago",
					"charlie — open — latest update 2 weeks ago",
				],
			});
			expect(result.pi.sentUserMessages[0]).toContain("```text\ncharlie\n```");
		});
	});

	test("picker cancellation sends no prompt", async () => {
		const result = await runObjectiveAutorun(
			"",
			[listStep(["alpha", "bravo"]), diffStep(""), statusStep("")],
			{ cancelSelect: true },
		);

		result.pi.assertDone();
		expect(result.notifications).toEqual([
			{ message: "Objective selection cancelled.", level: "info" },
		]);
		expect(result.pi.sentUserMessages).toEqual([]);
	});

	test("zero active Objectives sends no prompt", async () => {
		const result = await runObjectiveAutorun("", [listStep([])]);

		result.pi.assertDone();
		expect(result.notifications).toEqual([
			{ message: "No active Objectives. Create one with /ns:objective:create.", level: "info" },
		]);
		expect(result.selections).toEqual([]);
		expect(result.pi.sentUserMessages).toEqual([]);
	});
});

describe("objective picker suggestion", () => {
	test("shows only the one changed active Objective before offering the rest", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo", "charlie"]),
			diffStep("M\t.ns/objectives/bravo/objective.md\n"),
			statusStep(""),
		]);

		result.pi.assertDone();
		expect(result.selections[0]).toEqual({
			title:
				"Select an active Objective for next work or execution preview (only Objective changed vs master)",
			items: [
				"bravo — suggested: only Objective changed vs master — open — latest update 2 weeks ago",
				"View other active Objectives…",
			],
		});
		expect(result.selections).toHaveLength(1);
		expect(result.pi.sentUserMessages[0]).toContain("bravo");
		expect(
			result.notifications.some(
				(notification) => notification.message === "Suggested bravo from objective diff vs master.",
			),
		).toBe(false);
	});

	test("dirty-only single active Objective is suggested with checkout wording", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo", "charlie"]),
			diffStep(""),
			statusStep(" M .ns/objectives/bravo/objective.md\0"),
		]);

		result.pi.assertDone();
		expect(result.selections[0]).toEqual({
			title:
				"Select an active Objective for next work or execution preview (only Objective changed in checkout or vs master)",
			items: [
				"bravo — suggested: only Objective changed in checkout or vs master — open — latest update 2 weeks ago",
				"View other active Objectives…",
			],
		});
		expect(result.pi.sentUserMessages[0]).toContain("bravo");
	});

	test("dirty-only suggestion uses checkout wording when trunk is unavailable", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo"], ""),
			statusStep(" M .ns/objectives/bravo/objective.md\0"),
		]);

		result.pi.assertDone();
		expect(result.pi.execCalls.map((call) => call.args[0])).toEqual(["status"]);
		expect(result.selections[0]).toEqual({
			title:
				"Select an active Objective for next work or execution preview (only Objective changed in checkout)",
			items: [
				"bravo — suggested: only Objective changed in checkout — open — latest update 2 weeks ago",
				"View other active Objectives…",
			],
		});
	});

	test("dirty and committed diff slugs are unioned changed-first", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo", "charlie", "delta"]),
			diffStep("M\t.ns/objectives/alpha/objective.md\n"),
			statusStep(" M .ns/objectives/charlie/objective.md\0"),
		]);

		result.pi.assertDone();
		expect(result.selections[0]).toEqual({
			title:
				"Select an active Objective for next work or execution preview (changed Objectives in checkout or vs master)",
			items: [
				"alpha — changed in checkout or vs master — open — latest update 2 weeks ago",
				"charlie — changed in checkout or vs master — open — latest update 2 weeks ago",
				"View other active Objectives…",
			],
		});
		expect(result.selections).toHaveLength(1);
		expect(result.pi.sentUserMessages[0]).toContain("alpha");
	});

	test("dirty slug not in active records is ignored", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo"]),
			diffStep(""),
			statusStep(" M .ns/objectives/closed-objective/objective.md\0"),
		]);

		result.pi.assertDone();
		expect(result.selections[0]?.items).toEqual([
			"alpha — open — latest update 2 weeks ago",
			"bravo — open — latest update 2 weeks ago",
		]);
	});

	test("hides blocked Objectives from objective-next picker menus", async () => {
		const result = await runObjectiveNext("", [
			step("objective", ["list", "--format", "json"], {
				stdout: objectiveListFromRecords([
					{ slug: "alpha", status: "open", latestUpdateIso: "2026-01-01T00:00:00Z" },
					{
						slug: "bravo",
						status: "open",
						latestUpdateIso: "2026-01-02T00:00:00Z",
						isBlocked: true,
					},
					{ slug: "charlie", status: "open", latestUpdateIso: "2026-01-03T00:00:00Z" },
				]),
			}),
			diffStep("M\t.ns/objectives/bravo/objective.md\n"),
			statusStep(""),
		]);

		result.pi.assertDone();
		expect(result.selections[0]?.items).toEqual([
			"alpha — open — latest update 2 weeks ago",
			"charlie — open — latest update 2 weeks ago",
		]);
		expect(result.pi.sentUserMessages[0]).toContain("```text\nalpha\n```");
	});

	test("opens a second picker for the other Objectives when requested", async () => {
		const result = await runObjectiveNext(
			"",
			[
				listStep(["alpha", "bravo", "charlie"]),
				diffStep("M\t.ns/objectives/bravo/objective.md\n"),
				statusStep(""),
			],
			{ selectIndices: [1, 1] },
		);

		result.pi.assertDone();
		expect(result.selections[1]).toEqual({
			title:
				"Select an active Objective for next work or execution preview (other active Objectives)",
			items: [
				"alpha — open — latest update 2 weeks ago",
				"charlie — open — latest update 2 weeks ago",
			],
		});
		expect(result.pi.sentUserMessages[0]).toContain("charlie");
	});

	test("shows changed active Objectives before offering the rest", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo", "charlie", "delta"]),
			diffStep(
				["M\t.ns/objectives/alpha/objective.md", "M\t.ns/objectives/charlie/roadmap.md"].join("\n"),
			),
			statusStep(""),
		]);

		result.pi.assertDone();
		expect(result.selections[0]).toEqual({
			title:
				"Select an active Objective for next work or execution preview (changed Objectives vs master)",
			items: [
				"alpha — changed vs master — open — latest update 2 weeks ago",
				"charlie — changed vs master — open — latest update 2 weeks ago",
				"View other active Objectives…",
			],
		});
		expect(result.selections).toHaveLength(1);
		expect(result.pi.sentUserMessages[0]).toContain("alpha");
	});

	test("opens a second picker for non-changed Objectives after the changed Objectives menu", async () => {
		const result = await runObjectiveNext(
			"",
			[
				listStep(["alpha", "bravo", "charlie", "delta"]),
				diffStep(
					["M\t.ns/objectives/alpha/objective.md", "M\t.ns/objectives/charlie/roadmap.md"].join(
						"\n",
					),
				),
				statusStep(""),
			],
			{ selectIndices: [2, 1] },
		);

		result.pi.assertDone();
		expect(result.selections[1]).toEqual({
			title:
				"Select an active Objective for next work or execution preview (other active Objectives)",
			items: [
				"bravo — open — latest update 2 weeks ago",
				"delta — open — latest update 2 weeks ago",
			],
		});
		expect(result.pi.sentUserMessages[0]).toContain("delta");
	});

	test("omits the View other choice when all active Objectives changed", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo"]),
			diffStep(
				["M\t.ns/objectives/alpha/objective.md", "M\t.ns/objectives/bravo/objective.md"].join("\n"),
			),
			statusStep(""),
		]);

		result.pi.assertDone();
		expect(result.selections[0]).toEqual({
			title:
				"Select an active Objective for next work or execution preview (changed Objectives vs master)",
			items: [
				"alpha — changed vs master — open — latest update 2 weeks ago",
				"bravo — changed vs master — open — latest update 2 weeks ago",
			],
		});
		expect(result.pi.sentUserMessages[0]).toContain("alpha");
	});

	test("does not suggest when the changed Objective slug is not active", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo"]),
			diffStep("M\t.ns/objectives/closed-objective/objective.md\n"),
			statusStep(""),
		]);

		result.pi.assertDone();
		const items = result.selections[0]?.items ?? [];
		expect(items).toEqual([
			"alpha — open — latest update 2 weeks ago",
			"bravo — open — latest update 2 weeks ago",
		]);
		expect(items.some((item) => item.includes("suggested"))).toBe(false);
	});

	test("filters inactive changed Objective slugs before diff suggestions", async () => {
		const result = await runObjectiveNext("", [
			listStep(["pi-extension-deepening"]),
			diffStep(
				[
					"A\t.ns/objectives/pi-extension-architecture-deepening/closed.md",
					"M\t.ns/objectives/pi-extension-deepening/objective.md",
				].join("\n"),
			),
			statusStep(""),
		]);

		result.pi.assertDone();
		const items = result.selections[0]?.items ?? [];
		expect(items).toEqual([
			"pi-extension-deepening — changed vs master — open — latest update 2 weeks ago",
		]);
		expect(items.some((item) => item.includes("pi-extension-architecture-deepening"))).toBe(false);
		expect(result.pi.sentUserMessages[0]).toContain("pi-extension-deepening");
		expect(result.pi.sentUserMessages[0]).not.toContain("pi-extension-architecture-deepening");
	});

	test("does not claim only Objective changed when a changed slug is not active", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo", "charlie"]),
			diffStep(
				[
					"M\t.ns/objectives/bravo/objective.md",
					"M\t.ns/objectives/closed-objective/objective.md",
				].join("\n"),
			),
			statusStep(""),
		]);

		result.pi.assertDone();
		expect(result.selections[0]).toEqual({
			title:
				"Select an active Objective for next work or execution preview (changed Objectives vs master)",
			items: [
				"bravo — changed vs master — open — latest update 2 weeks ago",
				"View other active Objectives…",
			],
		});
		expect(result.pi.sentUserMessages[0]).toContain("bravo");
	});

	test("bypasses suggestion logic when an explicit slug is provided", async () => {
		const result = await runObjectiveNext("bravo", []);

		result.pi.assertDone();
		expect(result.pi.execCalls).toEqual([]);
		expect(result.selections).toEqual([]);
		expect(result.pi.sentUserMessages[0]).toContain("bravo");
	});

	test("git status failure preserves committed diff suggestions", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo"]),
			diffStep("M\t.ns/objectives/bravo/objective.md\n"),
			statusStep("", { code: 1, stderr: "status failed" }),
		]);

		result.pi.assertDone();
		expect(result.selections[0]).toEqual({
			title:
				"Select an active Objective for next work or execution preview (only Objective changed vs master)",
			items: [
				"bravo — suggested: only Objective changed vs master — open — latest update 2 weeks ago",
				"View other active Objectives…",
			],
		});
	});

	test("git diff failure still allows dirty status suggestions", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo"]),
			diffStep("", { code: 1, stderr: "fatal: bad revision" }),
			statusStep(" M .ns/objectives/bravo/objective.md\0"),
		]);

		result.pi.assertDone();
		expect(result.selections[0]).toEqual({
			title:
				"Select an active Objective for next work or execution preview (only Objective changed in checkout or vs master)",
			items: [
				"bravo — suggested: only Objective changed in checkout or vs master — open — latest update 2 weeks ago",
				"View other active Objectives…",
			],
		});
	});

	test("falls back to the normal picker when git diff and status fail", async () => {
		const result = await runObjectiveNext(
			"",
			[
				listStep(["alpha", "bravo"]),
				diffStep("", { code: 1, stderr: "fatal: bad revision" }),
				statusStep("", { code: 1, stderr: "status failed" }),
			],
			{ cancelSelect: true },
		);

		result.pi.assertDone();
		const items = result.selections[0]?.items ?? [];
		expect(items).toEqual([
			"alpha — open — latest update 2 weeks ago",
			"bravo — open — latest update 2 weeks ago",
		]);
		expect(result.notifications).toEqual([
			{ message: "Objective selection cancelled.", level: "info" },
		]);
		expect(result.pi.sentUserMessages).toEqual([]);
	});

	test("ns:objective:close uses normal changed-first selection, not compact suggestion UX", async () => {
		const result = await runObjectiveCommand({
			commandName: "ns:objective:close",
			args: "",
			script: [
				listStep(["alpha", "bravo", "charlie"]),
				diffStep("M\t.ns/objectives/bravo/objective.md\n"),
				statusStep(""),
			],
		});

		result.pi.assertDone();
		expect(result.notifications).toContainEqual({
			message: "Found changed Objective bravo from objective diff vs master.",
			level: "info",
		});
		expect(result.selections).toEqual([
			{
				title: "Select an active Objective to close",
				items: [
					"bravo — suggested: only Objective changed vs master — open — latest update 2 weeks ago",
					"alpha — open — latest update 2 weeks ago",
					"charlie — open — latest update 2 weeks ago",
				],
			},
		]);
		expect(result.pi.sentUserMessages[0]).toContain("```text\nbravo\n```");
	});
});

describe("objective command shared selection policy", () => {
	test("slug picker commands register an argument hint and completer", () => {
		const pi = new FakePi();

		objectiveExtension(pi);

		for (const commandName of OBJECTIVE_COMMAND_NAMES) {
			const command = pi.commands.get(commandName);
			expect(command?.argumentHint).toBe("[objective-slug-or-path]");
			expect(typeof command?.getArgumentCompletions).toBe("function");
		}
	});

	test("ns:objective:next completions return fast active Objective slug candidates", async () => {
		const { pi, items } = await objectiveCommandCompletions("ns:objective:next", "", [
			step("ns", ["objective", "exec", "list-candidates", "--format", "json"], {
				stdout: objectiveCandidatesFromRecords([
					{ slug: "alpha", status: "open" },
					{ slug: "bravo", status: "open" },
				]),
			}),
		]);

		pi.assertDone();
		expect(pi.execCalls[0]).toMatchObject({
			command: "ns",
			args: ["objective", "exec", "list-candidates", "--format", "json"],
			options: { cwd: ROOT },
		});
		expect(pi.execCalls[0]?.options?.signal).toBeInstanceOf(AbortSignal);
		expect(pi.execCalls[0]?.options?.timeout).toBeUndefined();
		expect(items).toEqual([
			{ value: "alpha", label: "alpha", description: "open" },
			{ value: "bravo", label: "bravo", description: "open" },
		]);
	});

	test("slug completions filter by prefix and use the fresh cache", async () => {
		const pi = new FakePi([candidateStep(["alpha", "bravo"])]);
		objectiveExtension(pi);
		await pi.emitSessionStart(createContext().ctx);
		const command = pi.commands.get("ns:objective:next");

		const allItems = await command?.getArgumentCompletions?.("");
		const filteredItems = await command?.getArgumentCompletions?.("br");

		pi.assertDone();
		expect(allItems?.map((item) => item.value)).toEqual(["alpha", "bravo"]);
		expect(filteredItems?.map((item) => item.value)).toEqual(["bravo"]);
		expect(pi.execCalls).toHaveLength(1);
	});

	test("slug completions reject unsupported multi-arg input without loading candidates", async () => {
		const { pi, items } = await objectiveCommandCompletions("ns:objective:next", "alpha bravo", []);

		pi.assertDone();
		expect(items).toBeNull();
		expect(pi.execCalls).toEqual([]);
	});

	test("slug completions fail quietly for candidate command failures", async () => {
		const { pi, items } = await objectiveCommandCompletions("ns:objective:next", "", [
			step("ns", ["objective", "exec", "list-candidates", "--format", "json"], {
				code: 1,
				stderr: "failed",
			}),
		]);

		pi.assertDone();
		expect(items).toBeNull();
		expect(pi.sentMessages).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
	});

	test("slug completions fail quietly for malformed objective candidate JSON", async () => {
		const { pi, items } = await objectiveCommandCompletions("ns:objective:next", "", [
			step("ns", ["objective", "exec", "list-candidates", "--format", "json"], { stdout: "{" }),
		]);

		pi.assertDone();
		expect(items).toBeNull();
		expect(pi.sentMessages).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
	});

	test("empty-args picker commands never invoke the removed --current list flag", async () => {
		for (const commandName of OBJECTIVE_COMMAND_NAMES) {
			const result = await runObjectiveCommand({
				commandName: commandName,
				args: "",
				script: [listStep([])],
			});

			result.pi.assertDone();
			expectNoObjectiveListExec(result);
		}

		const stackResult = await runObjectiveAutorun("", [listStep([])]);

		stackResult.pi.assertDone();
		expectNoObjectiveListExec(stackResult);
	});

	for (const commandName of OBJECTIVE_COMMAND_NAMES) {
		describe(commandName, () => {
			test("explicit slug or path bypasses objective list and git evidence", async () => {
				const explicitObjective = ".ns/objectives/bravo/objective.md";
				const result = await runObjectiveCommand({
					commandName: commandName,
					args: `  ${explicitObjective}  `,
				});

				result.pi.assertDone();
				expect(result.pi.execCalls).toEqual([]);
				expect(result.selections).toEqual([]);
				expect(result.waitForIdleCalls()).toBe(1);
				expectPromptSelectsObjective(commandName, result.pi.sentUserMessages[0], explicitObjective);
				expect(result.pi.sentUserMessages[0]).toContain(
					`<skill name="${OBJECTIVE_SKILLS_BY_COMMAND[commandName]}"`,
				);
			});

			test("empty args load active candidates with objective list json", async () => {
				const result = await runObjectiveCommand({
					commandName: commandName,
					args: "",
					script: [listStep(["alpha"]), diffStep(""), statusStep("")],
					contextOptions: { cancelSelect: true },
				});

				result.pi.assertDone();
				expectNoObjectiveListExec(result);
				expect(result.selections).toHaveLength(1);
				expect(result.pi.sentUserMessages).toEqual([]);
			});

			test("zero active Objectives notify and send no prompt", async () => {
				const result = await runObjectiveCommand({
					commandName: commandName,
					args: "",
					script: [listStep([])],
				});

				result.pi.assertDone();
				expect(result.pi.execCalls).toHaveLength(0);
				expectNoObjectiveListExec(result);
				expect(result.notifications).toEqual([
					{
						message: "No active Objectives. Create one with /ns:objective:create.",
						level: "info",
					},
				]);
				expect(result.selections).toEqual([]);
				expect(result.pi.sentUserMessages).toEqual([]);
			});

			test("invalid objective list JSON notifies and sends no prompt", async () => {
				const result = await runObjectiveCommand({
					commandName: commandName,
					args: "",
					script: [step("objective", ["list", "--format", "json"], { stdout: "{" })],
				});

				result.pi.assertDone();
				expect(result.pi.execCalls).toHaveLength(0);
				expectNoObjectiveListExec(result);
				expect(result.notifications[0]?.message).toContain("Malformed objective list JSON");
				expect(result.notifications[0]?.level).toBe("error");
				expect(result.selections).toEqual([]);
				expect(result.pi.sentUserMessages).toEqual([]);
			});

			test("picker cancellation sends no prompt", async () => {
				const result = await runObjectiveCommand({
					commandName: commandName,
					args: "",
					script: [
						listStep(["alpha", "bravo"]),
						diffStep("M\t.ns/objectives/bravo/objective.md\n"),
						statusStep(""),
					],
					contextOptions: { cancelSelect: true },
				});

				result.pi.assertDone();
				expect(result.notifications).toContainEqual({
					message: "Objective selection cancelled.",
					level: "info",
				});
				expect(result.pi.sentUserMessages).toEqual([]);
			});

			test("selected slug is embedded as an explicit selection in the generated skill prompt", async () => {
				const result = await runObjectiveCommand({
					commandName: commandName,
					args: "",
					script: [listStep(["alpha", "bravo"]), diffStep(""), statusStep("")],
					contextOptions: { selectIndex: 0 },
				});

				result.pi.assertDone();
				expectPromptSelectsObjective(commandName, result.pi.sentUserMessages[0], "alpha");
			});
		});
	}
});

describe("objective command prompt details", () => {
	test("expanded skill block appears in an objective prompt for an explicit slug", async () => {
		await withTempRepoSkill(
			{
				skillName: "objective-next",
				markdown: `---
name: objective-next
hidden-frontmatter-token: do-not-include
---

# Objective Next Skill

Use the selected Objective.
`,
				prefix: "objective-next-skill-",
			},
			async ({ repoDir, skillDir, skillPath }) => {
				const result = await runObjectiveCommand({
					commandName: "ns:objective:next",
					args: "bravo",
					script: [],
					contextOptions: { cwd: repoDir },
					skills: [effectiveSkill("objective-next", skillPath, skillDir)],
				});

				result.pi.assertDone();
				const prompt = result.pi.sentUserMessages[0] ?? "";
				expect(prompt).toContain(`<skill name="objective-next" location="${skillPath}">`);
				expect(prompt).toContain(`References are relative to ${skillDir}.`);
				expect(prompt).toContain("# Objective Next Skill\n\nUse the selected Objective.");
				expect(prompt).not.toContain("hidden-frontmatter-token");
				expect(prompt).toContain(
					"Run objective-next for this explicitly selected Objective slug or path:",
				);
				expect(prompt).toContain("```text\nbravo\n```");
				expect(result.notifications).toContainEqual({
					message: "Invoking objective-next for bravo.",
					level: "info",
				});
			},
		);
	});

	test("ns:objective:next canonical skill prompt requires a work-left estimate", async () => {
		const result = await runObjectiveCommand({
			commandName: "ns:objective:next",
			args: "bravo",
		});

		result.pi.assertDone();
		expect(result.pi.sentUserMessages[0]).toContain("Form a best-effort work-left estimate");
		expect(result.pi.sentUserMessages[0]).toContain(
			"semantic steps remaining until Objective completion",
		);
		expect(result.pi.sentUserMessages[0]).toContain("next discovery/decision step");
		expect(result.pi.sentUserMessages[0]).toContain("not elapsed time");
	});

	test("ns:objective:next prompt preauthorizes clear staleness-check updates", async () => {
		const result = await runObjectiveCommand({
			commandName: "ns:objective:next",
			args: "bravo",
		});

		result.pi.assertDone();
		expect(result.pi.sentUserMessages[0]).toContain(
			"This explicit objective-next invocation preauthorizes update-and-continue",
		);
		expect(result.pi.sentUserMessages[0]).toContain("when the Staleness Check finds");
		expect(result.pi.sentUserMessages[0]).toContain(
			"run objective-update for this selected Objective",
		);
		expect(result.pi.sentUserMessages[0]).toContain(
			"Ask before updating only when evidence, Objective fit, or update scope is ambiguous.",
		);
	});

	test("objective-update prompt includes the post-selection evidence workflow reminder", async () => {
		const result = await runObjectiveCommand({
			commandName: "ns:objective:update",
			args: "bravo",
		});

		result.pi.assertDone();
		expect(result.pi.sentUserMessages[0]).toContain(
			"After this explicit selection, follow objective-update's normal post-selection evidence workflow.",
		);
	});

	test("ns:objective:close skill and prompt include closure confirmation guidance", async () => {
		const result = await runObjectiveCommand({
			commandName: "ns:objective:close",
			args: "bravo",
		});

		result.pi.assertDone();
		expect(result.pi.sentUserMessages[0]).toContain("Confirm the closure outcome is clear");
		expect(result.pi.sentUserMessages[0]).toContain(
			"Load every edge-connected Objective before authoring closure",
		);
		expect(result.pi.sentUserMessages[0]).toContain(
			"Propagate the closure through every Objective Edge",
		);
		expect(result.pi.sentUserMessages[0]).toContain(
			"Run objective-close for this explicitly selected Objective slug or path:",
		);
		expect(result.pi.sentUserMessages[0]).toContain(
			"After this explicit selection, follow objective-close's normal closure confirmation and connected-Objective propagation workflow before mutating Objective files.",
		);
	});

	test("ns:objective:next prompt does not include the objective-update evidence workflow reminder", async () => {
		const result = await runObjectiveCommand({
			commandName: "ns:objective:next",
			args: "bravo",
		});

		result.pi.assertDone();
		expect(result.pi.sentUserMessages[0]).not.toContain("normal post-selection evidence workflow");
	});

	test("objective command prompts contain no model-mediated chooser reminder", async () => {
		for (const commandName of OBJECTIVE_COMMAND_NAMES) {
			const result = await runObjectiveCommand({
				commandName: commandName,
				args: "bravo",
			});
			const prompt = result.pi.sentUserMessages[0] ?? "";
			expect(prompt).not.toContain("Pi prompt-action note");
			expect(prompt).not.toContain("objective_next_prompt_action");
		}
	});
});
