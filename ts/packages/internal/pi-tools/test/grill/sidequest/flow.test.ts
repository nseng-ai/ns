import { describe, expect, test } from "vitest";

import {
	GRILL_ASK_TOOL_NAME,
	GRILL_RETURN_COMMAND_NAME,
	GRILL_SIDEQUEST_COMMAND_NAME,
	GRILL_UI_CONTRACT,
	executeGrillAsk,
	registerGrillUiExtension,
	type GrillUiCommandContext,
	type ToolDefinition,
} from "../../../src/grill/extension.ts";
import { SIDE_QUEST_DISPOSITION_CHOICES } from "../../../src/grill/sidequest/prompts.ts";
import { registerGrillSidequest } from "../../../src/grill/sidequest/register.ts";
import type {
	SidequestBeforeTreeEvent,
	SidequestBeforeTreeResult,
	SidequestCommandContext,
	SidequestEventContext,
	SidequestEventHandler,
	SidequestTreeEvent,
} from "../../../src/grill/sidequest/protocol.ts";
import {
	GRILL_SIDEQUEST_EVENT_ENTRY_TYPE,
	scanGrillBranch,
} from "../../../src/grill/sidequest/state.ts";
import { GRILL_STATUS_WIDGET_KEY } from "../../../src/grill/sidequest/status.ts";

const KICKOFF_TEXT = "<structured-grill-question-ui-contract>\nplan under grill";

/**
 * Registered commands are stored with a context type satisfying both the base
 * grill command context and the side-quest command context, so one fake host
 * can register (and tests can invoke) both command families.
 */
type FakeCommandContext = GrillUiCommandContext & SidequestCommandContext;

interface FakeCommand {
	description?: string;
	handler(args: string, ctx: FakeCommandContext): Promise<void> | void;
}

class FakeSidequestPi {
	readonly commands = new Map<string, FakeCommand>();
	readonly tools = new Map<string, ToolDefinition>();
	readonly sentUserMessages: string[] = [];
	readonly appendedEntries: Array<{ customType: string; data?: unknown }> = [];
	readonly materializedEntries: unknown[] = [];
	private nextEntryNumber = 1;
	readonly labels: Array<{ entryId: string; label: string | undefined }> = [];
	private readonly handlers = new Map<string, unknown[]>();

	registerCommand(name: string, options: FakeCommand): void {
		this.commands.set(name, options);
	}

	registerTool(definition: ToolDefinition): void {
		this.tools.set(definition.name, definition);
	}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
	}

	on(
		event: "session_before_tree",
		handler: SidequestEventHandler<SidequestBeforeTreeEvent, SidequestBeforeTreeResult>,
	): void;
	on(event: "session_tree", handler: SidequestEventHandler<SidequestTreeEvent>): void;
	on(
		event: "agent_settled" | "turn_end" | "session_start" | "session_shutdown",
		handler: SidequestEventHandler<unknown>,
	): void;
	on(event: string, handler: unknown): void {
		const list = this.handlers.get(event) ?? [];
		list.push(handler);
		this.handlers.set(event, list);
	}

	appendEntry(customType: string, data?: unknown): void {
		this.appendedEntries.push({ customType, data });
		this.materializedEntries.push({
			type: "custom",
			id: `custom-${this.nextEntryNumber}`,
			parentId: null,
			customType,
			data,
		});
		this.nextEntryNumber += 1;
	}

	setLabel(entryId: string, label: string | undefined): void {
		this.labels.push({ entryId, label });
	}

	async emit(event: string, payload: unknown, ctx: SidequestEventContext): Promise<unknown> {
		const registered = this.handlers.get(event) ?? [];
		expect(registered.length, `exactly one ${event} handler`).toBe(1);
		const handler = registered[0];
		if (typeof handler !== "function") throw new Error(`Missing ${event} handler`);
		return handler(payload, ctx);
	}

	hasHandler(event: string): boolean {
		return (this.handlers.get(event) ?? []).length > 0;
	}
}

function register(): { pi: FakeSidequestPi; tool: ToolDefinition } {
	const pi = new FakeSidequestPi();
	registerGrillUiExtension(pi);
	const tool = pi.tools.get(GRILL_ASK_TOOL_NAME);
	expect(tool).toBeDefined();
	if (tool === undefined) throw new Error("Missing registered grill_ask tool");
	return { pi, tool };
}

function registeredCommand(pi: FakeSidequestPi, name: string): FakeCommand {
	const command = pi.commands.get(name);
	if (command === undefined) throw new Error(`Missing registered ${name} command`);
	return command;
}

function userEntry(id: string, text: string): unknown {
	return { type: "message", id, parentId: null, message: { role: "user", content: text } };
}

function askEntry(id: string, toolCallId: string, question: string): unknown {
	return {
		type: "message",
		id,
		parentId: null,
		message: {
			role: "assistant",
			content: [
				{ type: "toolCall", id: toolCallId, name: GRILL_ASK_TOOL_NAME, arguments: { question } },
			],
		},
	};
}

function grillingBranch(): unknown[] {
	return [userEntry("kickoff", KICKOFF_TEXT), askEntry("ask-1", "call-1", "Pending question?")];
}

function sideQuestEventEntry(id: string, data: unknown): unknown {
	return { type: "custom", id, parentId: null, customType: GRILL_SIDEQUEST_EVENT_ENTRY_TYPE, data };
}

function questBranch(): unknown[] {
	return [
		...grillingBranch(),
		sideQuestEventEntry("mark", {
			version: 1,
			event: "started",
			questId: "quest-1",
			topic: "cache layout",
			pendingAsk: { question: "Pending question?", toolCallId: "call-1" },
		}),
	];
}

interface WidgetCall {
	lines: string[] | undefined;
	placement: string | undefined;
}

interface FakeContextRecording {
	notifications: Array<{ message: string; level: string | undefined }>;
	widgets: WidgetCall[];
	navigations: Array<{ targetId: string; options: unknown }>;
	selectTitles: string[];
}

interface FakeContextOptions {
	branch?: unknown[];
	entries?: unknown[];
	selectResult?: string | ((title: string, options: string[]) => string | undefined);
	onNavigate?: (targetId: string, options: unknown) => Promise<void> | void;
}

function fakeCommandContext(options: FakeContextOptions = {}): {
	ctx: FakeCommandContext;
	recording: FakeContextRecording;
} {
	const recording: FakeContextRecording = {
		notifications: [],
		widgets: [],
		navigations: [],
		selectTitles: [],
	};
	const ctx: FakeCommandContext = {
		cwd: "/repo",
		hasUI: true,
		ui: {
			select: async (title, choices) => {
				recording.selectTitles.push(title);
				return typeof options.selectResult === "function"
					? options.selectResult(title, choices)
					: options.selectResult;
			},
			notify: (message, level) => {
				recording.notifications.push({ message, level });
			},
			setWidget: (key, lines, widgetOptions) => {
				expect(key).toBe(GRILL_STATUS_WIDGET_KEY);
				recording.widgets.push({ lines, placement: widgetOptions?.placement });
			},
		},
		sessionManager: {
			getBranch: () => options.branch ?? [],
			getEntries: () => options.entries ?? options.branch ?? [],
		},
		waitForIdle: async () => {},
		navigateTree: async (targetId, navigateOptions) => {
			recording.navigations.push({ targetId, options: navigateOptions });
			await options.onNavigate?.(targetId, navigateOptions);
			return { cancelled: false };
		},
	};
	return { ctx, recording };
}

describe("registerGrillSidequest wiring", () => {
	test("registers both side-quest commands and the session hooks on a capable host", () => {
		const { pi } = register();

		expect([...pi.commands.keys()]).toContain(GRILL_SIDEQUEST_COMMAND_NAME);
		expect([...pi.commands.keys()]).toContain(GRILL_RETURN_COMMAND_NAME);
		for (const event of [
			"session_before_tree",
			"session_tree",
			"agent_settled",
			"turn_end",
			"session_start",
			"session_shutdown",
		]) {
			expect(pi.hasHandler(event), event).toBe(true);
		}
	});

	test("the grill UI contract advertises the side-quest workflow", () => {
		expect(GRILL_UI_CONTRACT).toContain("<grill-side-quest-contract>");
		expect(GRILL_UI_CONTRACT).toContain("sq: <topic>");
	});
});

describe("freeform sentinel to labeled mark", () => {
	test("a sentinel answer appends the canonical start and labels its mark on agent_settled", async () => {
		const { pi, tool } = register();

		const result = await tool.execute(
			"call-1",
			{
				question: "Pending question?",
				recommended: { answer: "Option A" },
				options: [
					{ value: "a", label: "Option A" },
					{ value: "b", label: "Option B" },
				],
			},
			undefined,
			undefined,
			{
				hasUI: true,
				ui: {
					select: async (_title, choices) => choices.find((choice) => choice.includes("Other")),
					editor: async () => "sq: cache layout",
				},
				sessionManager: { getBranch: () => grillingBranch() },
			},
		);

		expect(result.details).toMatchObject({ action: "side-quest", topic: "cache layout" });

		const materializedBranch = [...grillingBranch(), ...pi.materializedEntries];
		const { ctx } = fakeCommandContext({
			branch: materializedBranch,
			entries: materializedBranch,
		});
		await pi.emit("agent_settled", { type: "agent_settled" }, ctx);

		expect(pi.labels).toEqual([
			{ entryId: "custom-1", label: "⚑ side quest base · Pending question?" },
		]);

		// A second settle does not re-label.
		await pi.emit("agent_settled", { type: "agent_settled" }, ctx);
		expect(pi.labels).toHaveLength(1);
	});
});

describe("/pi:grill-sidequest command", () => {
	test("refuses blank topics, missing grills, and active quests", async () => {
		const { pi } = register();
		const command = registeredCommand(pi, GRILL_SIDEQUEST_COMMAND_NAME);

		const blank = fakeCommandContext({ branch: grillingBranch() });
		await command.handler("   ", blank.ctx);
		expect(blank.recording.notifications).toEqual([
			{ message: "Usage: /pi:grill-sidequest <topic>", level: "warning" },
		]);

		const noGrill = fakeCommandContext({ branch: [] });
		await command.handler("explore caching", noGrill.ctx);
		expect(noGrill.recording.notifications[0]?.message).toContain("No active grill session");

		const active = fakeCommandContext({ branch: questBranch() });
		await command.handler("another topic", active.ctx);
		expect(active.recording.notifications[0]?.message).toContain(
			"A side quest is already active (cache layout)",
		);
		expect(pi.sentUserMessages).toEqual([]);
	});

	test("starts an idle side quest with a canonical event and pending question", async () => {
		const { pi } = register();
		const command = registeredCommand(pi, GRILL_SIDEQUEST_COMMAND_NAME);
		const { ctx } = fakeCommandContext({ branch: grillingBranch() });

		await command.handler("explore the cache layer", ctx);

		expect(pi.appendedEntries).toHaveLength(1);
		expect(pi.appendedEntries[0]).toMatchObject({
			customType: GRILL_SIDEQUEST_EVENT_ENTRY_TYPE,
			data: {
				version: 1,
				event: "started",
				topic: "explore the cache layer",
				pendingAsk: { question: "Pending question?", toolCallId: "call-1" },
			},
		});
		expect(pi.sentUserMessages).toHaveLength(1);
		const message = pi.sentUserMessages[0];
		if (message === undefined) throw new Error("Missing side-quest kickoff message");
		expect(message).toContain(
			"<grill-sidequest-start>\nexplore the cache layer\n</grill-sidequest-start>",
		);
		expect(message).toContain("The pending question was: Pending question?");
		expect(message).toContain("NOT an answer");
	});
});

describe("canonical start event parity", () => {
	test("menu, sentinel, and slash command emit the same v1 start shape", async () => {
		const pi = new FakeSidequestPi();
		const questIds = ["quest-menu", "quest-sentinel", "quest-command"];
		const capability = registerGrillSidequest(pi, {
			createQuestId: () => {
				const questId = questIds.shift();
				if (questId === undefined) throw new Error("Missing deterministic quest id");
				return questId;
			},
		});
		const input = {
			question: "Pending question?",
			recommended: { answer: "A", optionValue: "a" },
			options: [
				{ value: "a", label: "A" },
				{ value: "b", label: "B" },
			],
		};
		const menuContext = {
			hasUI: true,
			ui: {
				select: async (_title: string, choices: string[]) =>
					choices.find((choice) => choice.includes("Start a side quest")),
				editor: async () => "same topic",
			},
			sessionManager: { getBranch: () => grillingBranch() },
		};
		await executeGrillAsk(input, menuContext, {
			toolCallId: "call-1",
			sideQuest: capability,
		});

		await executeGrillAsk(
			input,
			{
				...menuContext,
				ui: {
					select: async (_title: string, choices: string[]) =>
						choices.find((choice) => choice.includes("Other")),
					editor: async () => "sq: same topic",
				},
			},
			{ toolCallId: "call-1", sideQuest: capability },
		);

		const slash = registeredCommand(pi, GRILL_SIDEQUEST_COMMAND_NAME);
		await slash.handler("same topic", fakeCommandContext({ branch: grillingBranch() }).ctx);

		expect(pi.appendedEntries).toEqual(
			["quest-menu", "quest-sentinel", "quest-command"].map((questId) => ({
				customType: GRILL_SIDEQUEST_EVENT_ENTRY_TYPE,
				data: {
					version: 1,
					event: "started",
					questId,
					topic: "same topic",
					pendingAsk: { question: "Pending question?", toolCallId: "call-1" },
				},
			})),
		);
		expect(pi.materializedEntries).toMatchObject([
			{ id: "custom-1", customType: GRILL_SIDEQUEST_EVENT_ENTRY_TYPE },
			{ id: "custom-2", customType: GRILL_SIDEQUEST_EVENT_ENTRY_TYPE },
			{ id: "custom-3", customType: GRILL_SIDEQUEST_EVENT_ENTRY_TYPE },
		]);
	});

	test("reload reconstruction needs only the canonical custom start entry", () => {
		const reloaded = scanGrillBranch([
			...grillingBranch(),
			sideQuestEventEntry("canonical-mark", {
				version: 1,
				event: "started",
				questId: "quest-reloaded",
				topic: "reloaded topic",
				pendingAsk: { question: "Pending question?", toolCallId: "call-1" },
			}),
		]);

		expect(reloaded).toHaveProperty("activeQuest", {
			questId: "quest-reloaded",
			markEntryId: "canonical-mark",
			topic: "reloaded topic",
			pendingAsk: { question: "Pending question?", toolCallId: "call-1" },
		});
	});
});

describe("/pi:grill-return command", () => {
	test("warns when no side quest is active", async () => {
		const { pi } = register();
		const command = registeredCommand(pi, GRILL_RETURN_COMMAND_NAME);
		const { ctx, recording } = fakeCommandContext({ branch: grillingBranch() });

		await command.handler("", ctx);

		expect(recording.notifications).toEqual([
			{ message: "No active side quest to return from.", level: "warning" },
		]);
		expect(recording.navigations).toEqual([]);
	});

	test.each([
		{
			choice: SIDE_QUEST_DISPOSITION_CHOICES["fold-in"],
			summarize: true,
			instructionFragment: "every decision, fact, constraint, or design implication",
		},
		{
			choice: SIDE_QUEST_DISPOSITION_CHOICES.note,
			summarize: true,
			instructionFragment: "one or two sentences",
		},
	])("navigates to the mark with $choice", async ({ choice, summarize, instructionFragment }) => {
		const { pi } = register();
		const command = registeredCommand(pi, GRILL_RETURN_COMMAND_NAME);
		const { ctx, recording } = fakeCommandContext({
			branch: questBranch(),
			selectResult: choice,
		});

		await command.handler("", ctx);

		expect(recording.navigations).toHaveLength(1);
		const navigation = recording.navigations[0];
		if (navigation === undefined) throw new Error("Missing side-quest return navigation");
		expect(navigation.targetId).toBe("mark");
		expect(navigation.options).toMatchObject({
			summarize,
			label: "side quest: cache layout",
		});
		expect(JSON.stringify(navigation.options)).toContain(instructionFragment.slice(0, 20));
	});

	test("discard navigates without summary or instructions", async () => {
		const { pi } = register();
		const command = registeredCommand(pi, GRILL_RETURN_COMMAND_NAME);
		const { ctx, recording } = fakeCommandContext({
			branch: questBranch(),
			selectResult: SIDE_QUEST_DISPOSITION_CHOICES.discard,
		});

		await command.handler("", ctx);

		expect(recording.navigations).toEqual([{ targetId: "mark", options: { summarize: false } }]);
	});

	test("cancelling the picker skips navigation", async () => {
		const { pi } = register();
		const command = registeredCommand(pi, GRILL_RETURN_COMMAND_NAME);
		const { ctx, recording } = fakeCommandContext({ branch: questBranch() });

		await command.handler("", ctx);

		expect(recording.navigations).toEqual([]);
		expect(recording.notifications).toEqual([
			{ message: "Side-quest return cancelled.", level: "info" },
		]);
	});

	test("the before-tree hook skips its picker during a command-initiated return", async () => {
		const { pi } = register();
		const command = registeredCommand(pi, GRILL_RETURN_COMMAND_NAME);
		const beforeTreeResults: unknown[] = [];
		let hookSelectCalls = 0;

		const hookContext: SidequestEventContext = {
			hasUI: true,
			ui: {
				select: async () => {
					hookSelectCalls += 1;
					return SIDE_QUEST_DISPOSITION_CHOICES["fold-in"];
				},
			},
			sessionManager: { getBranch: () => questBranch() },
		};

		const { ctx } = fakeCommandContext({
			branch: questBranch(),
			selectResult: SIDE_QUEST_DISPOSITION_CHOICES["fold-in"],
			onNavigate: async (targetId) => {
				beforeTreeResults.push(
					await pi.emit(
						"session_before_tree",
						{ preparation: { targetId, userWantsSummary: true } },
						hookContext,
					),
				);
			},
		});

		await command.handler("", ctx);

		expect(beforeTreeResults).toEqual([undefined]);
		expect(hookSelectCalls).toBe(0);

		// The flag is consumed: a later native jump asks again.
		const nativeResult = await pi.emit(
			"session_before_tree",
			{ preparation: { targetId: "mark", userWantsSummary: true } },
			hookContext,
		);
		expect(nativeResult).toMatchObject({ label: "side quest: cache layout" });
		expect(hookSelectCalls).toBe(1);
	});
});

describe("native tree-jump return", () => {
	test("offers Fold in / Note and applies the chosen summary instructions", async () => {
		const { pi } = register();
		const { ctx, recording } = fakeCommandContext({
			branch: questBranch(),
			selectResult: SIDE_QUEST_DISPOSITION_CHOICES.note,
		});

		const result = await pi.emit(
			"session_before_tree",
			{ preparation: { targetId: "mark", userWantsSummary: true } },
			ctx,
		);

		expect(result).toMatchObject({ label: "side quest: cache layout" });
		expect(JSON.stringify(result)).toContain("one or two sentences");
		expect(recording.selectTitles).toEqual(["Returning from side quest: cache layout"]);
	});

	test("native no-summary means Discard: no picker, no overrides", async () => {
		const { pi } = register();
		const { ctx, recording } = fakeCommandContext({ branch: questBranch() });

		const result = await pi.emit(
			"session_before_tree",
			{ preparation: { targetId: "mark", userWantsSummary: false } },
			ctx,
		);

		expect(result).toBeUndefined();
		expect(recording.selectTitles).toEqual([]);
	});

	test("jumps to other targets are ignored", async () => {
		const { pi } = register();
		const { ctx, recording } = fakeCommandContext({ branch: questBranch() });

		const result = await pi.emit(
			"session_before_tree",
			{ preparation: { targetId: "kickoff", userWantsSummary: true } },
			ctx,
		);

		expect(result).toBeUndefined();
		expect(recording.selectTitles).toEqual([]);
	});
});

describe("session_tree landing", () => {
	test("landing at the mark appends a closure entry and sends the resume message", async () => {
		const { pi } = register();
		const { ctx, recording } = fakeCommandContext({ branch: questBranch() });

		await pi.emit("session_tree", { newLeafId: "mark", oldLeafId: "quest-leaf" }, ctx);

		expect(pi.appendedEntries).toEqual([
			{
				customType: GRILL_SIDEQUEST_EVENT_ENTRY_TYPE,
				data: { version: 1, event: "closed", questId: "quest-1" },
			},
		]);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("Side quest `cache layout` is finished");
		expect(pi.sentUserMessages[0]).toContain(
			"Re-ask the pending question verbatim via grill_ask: Pending question?",
		);
		expect(pi.sentUserMessages[0]).toContain("was not an answer");
		expect(recording.widgets.length).toBeGreaterThan(0);
	});

	test("landing on a branch summary whose parent is the mark also closes the quest", async () => {
		const { pi } = register();
		const { ctx } = fakeCommandContext({ branch: questBranch() });

		await pi.emit(
			"session_tree",
			{
				newLeafId: "summary-entry",
				oldLeafId: "quest-leaf",
				summaryEntry: { id: "summary-entry", parentId: "mark" },
			},
			ctx,
		);

		expect(pi.appendedEntries).toHaveLength(1);
		expect(pi.sentUserMessages).toHaveLength(1);
	});

	test("tree jumps unrelated to a quest neither close nor resume", async () => {
		const { pi } = register();
		const { ctx } = fakeCommandContext({ branch: grillingBranch() });

		await pi.emit("session_tree", { newLeafId: "ask-1", oldLeafId: "kickoff" }, ctx);

		expect(pi.appendedEntries).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
	});
});

describe("status widget events", () => {
	test("turn_end refreshes the widget with the grilling line", async () => {
		const { pi } = register();
		const { ctx, recording } = fakeCommandContext({ branch: grillingBranch() });

		await pi.emit("turn_end", { type: "turn_end" }, ctx);

		expect(recording.widgets).toHaveLength(1);
		expect(recording.widgets[0]?.placement).toBe("belowEditor");
		expect(recording.widgets[0]?.lines?.[0]).toContain("▌GRILL · 0 answered · Q1 pending");
	});

	test("session_shutdown clears the widget", async () => {
		const { pi } = register();
		const { ctx, recording } = fakeCommandContext({ branch: grillingBranch() });

		await pi.emit("session_shutdown", { type: "session_shutdown" }, ctx);

		expect(recording.widgets).toEqual([{ lines: undefined, placement: "belowEditor" }]);
	});
});
