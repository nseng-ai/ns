import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import handoffExtension, {
	HANDOFF_LIST_MESSAGE_TYPE,
	buildCreateHandoffPrompt,
	buildPickupHandoffPrompt,
	deriveHandoffPreview,
	formatHandoffListPlain,
	formatHandoffPickupCommand,
	groupHandoffListItemsByBranch,
	parseHandoffKeysFromBrmemList,
	parseListHandoffArgs,
	parsePickupHandoffArgs,
	renderHandoffListMessage,
	resolveHandoffKey,
	type CommandContext,
	type ExecResult,
	type ExtensionAPI,
	type HandoffListMessageDetails,
	type HandoffListMessageItem,
} from "../src/handoff.ts";

const ROOT = "/repo";
const BRANCH = "feature/handoff";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type CommandInfo = NonNullable<ReturnType<NonNullable<ExtensionAPI["getCommands"]>>>[number];
type CustomMessage = Parameters<NonNullable<ExtensionAPI["sendMessage"]>>[0];
type MessageRenderer = Parameters<NonNullable<ExtensionAPI["registerMessageRenderer"]>>[1];

interface ExecCall {
	command: string;
	args: string[];
	options: { cwd?: string; timeout?: number } | undefined;
}

interface ScriptedExec {
	command: string;
	args: string[];
	result: Partial<ExecResult> | undefined;
}

interface Notification {
	message: string;
	level: "info" | "warning" | "error" | undefined;
}

interface Selection {
	title: string;
	items: string[];
}

interface InputPrompt {
	title: string;
	placeholder: string | undefined;
}

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly execCalls: ExecCall[] = [];
	readonly errors: string[] = [];
	readonly renderers = new Map<string, MessageRenderer>();
	readonly sentMessages: CustomMessage[] = [];
	readonly sentUserMessages: string[] = [];
	readonly registerMessageRenderer?: (customType: string, renderer: MessageRenderer) => void;
	readonly sendMessage?: (message: CustomMessage) => void;
	private readonly script: ScriptedExec[];
	private readonly commandInfos: CommandInfo[];

	constructor(
		script: ScriptedExec[] = [],
		commandInfos: CommandInfo[] = [],
		options: { registerMessageRenderer?: boolean; sendMessage?: boolean } = {},
	) {
		this.script = [...script];
		this.commandInfos = [...commandInfos];
		if (options.registerMessageRenderer ?? true) {
			this.registerMessageRenderer = (customType: string, renderer: MessageRenderer): void => {
				this.renderers.set(customType, renderer);
			};
		}
		if (options.sendMessage ?? true) {
			this.sendMessage = (message: CustomMessage): void => {
				this.sentMessages.push(message);
			};
		}
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	async exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
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

	getCommands(): CommandInfo[] {
		return this.commandInfos;
	}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

function step(command: string, args: string[], result?: Partial<ExecResult>): ScriptedExec {
	return { command, args, result };
}

function createContext(
	options: {
		hasUI?: boolean;
		cancelSelect?: boolean;
		selectIndex?: number;
		inputResponse?: string;
		inputUnavailable?: boolean;
	} = {},
): {
	ctx: CommandContext;
	notifications: Notification[];
	selections: Selection[];
	inputs: InputPrompt[];
	statuses: Array<string | undefined>;
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	const selections: Selection[] = [];
	const inputs: InputPrompt[] = [];
	const statuses: Array<string | undefined> = [];
	let waits = 0;

	const ui: CommandContext["ui"] = {
		notify(message: string, level?: "info" | "warning" | "error"): void {
			notifications.push({ message, level });
		},
		async select(title: string, items: string[]): Promise<string | undefined> {
			selections.push({ title, items: [...items] });
			if (options.cancelSelect) {
				return undefined;
			}
			return items[options.selectIndex ?? 0];
		},
		setStatus(_key: string, value: string | undefined): void {
			statuses.push(value);
		},
	};

	if (!options.inputUnavailable) {
		ui.input = async (title: string, placeholder?: string): Promise<string | undefined> => {
			inputs.push({ title, placeholder });
			return options.inputResponse;
		};
	}

	const ctx: CommandContext = {
		cwd: ROOT,
		hasUI: options.hasUI ?? true,
		ui,
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};

	return { ctx, notifications, selections, inputs, statuses, waitForIdleCalls: () => waits };
}

async function runCommand(
	commandName: "handoff:create" | "handoff:pickup" | "handoff:list",
	args: string,
	script: ScriptedExec[] = [],
	contextOptions: {
		hasUI?: boolean;
		cancelSelect?: boolean;
		selectIndex?: number;
		inputResponse?: string;
		inputUnavailable?: boolean;
	} = {},
	commandInfos: CommandInfo[] = [],
	piOptions: { registerMessageRenderer?: boolean; sendMessage?: boolean } = {},
): Promise<{
	pi: FakePi;
	notifications: Notification[];
	selections: Selection[];
	inputs: InputPrompt[];
	statuses: Array<string | undefined>;
	waitForIdleCalls: () => number;
}> {
	const pi = new FakePi(script, commandInfos, piOptions);
	handoffExtension(pi);
	const command = pi.commands.get(commandName);
	expect(command).toBeDefined();
	if (command === undefined) {
		throw new Error(`${commandName} was not registered`);
	}
	const context = createContext(contextOptions);
	await command.handler(args, context.ctx);
	return { pi, ...context };
}

function listJson(entries: Array<string | { key: string; branch: string }>, branch: string | null = BRANCH): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			namespace: "handoffs",
			key: null,
			branch,
			all_branches: branch === null,
			entries: entries.map((entry) => {
				if (typeof entry === "string") {
					return { namespace: "handoffs", key: entry, branch: branch ?? BRANCH };
				}
				return { namespace: "handoffs", key: entry.key, branch: entry.branch };
			}),
		},
	});
}

function branchStep(branch = BRANCH): ScriptedExec {
	return step("git", ["branch", "--show-current"], { stdout: `${branch}\n` });
}

function listStep(branch: string, keys: string[]): ScriptedExec {
	return step("brmem", ["list", "--namespace", "handoffs", "--branch", branch, "--format", "json"], {
		stdout: listJson(keys, branch),
	});
}

function listAllStep(entries: Array<{ key: string; branch: string }>): ScriptedExec {
	return step("brmem", ["list", "--namespace", "handoffs", "--all-branches", "--format", "json"], {
		stdout: listJson(entries, null),
	});
}

function getStep(branch: string, key: string, artifact: string): ScriptedExec {
	return step("brmem", ["get", key, "--namespace", "handoffs", "--branch", branch], { stdout: artifact });
}

function noopTheme(): { fg(_color: string, text: string): string; bold(text: string): string } {
	return {
		fg(_color: string, text: string): string {
			return text;
		},
		bold(text: string): string {
			return text;
		},
	};
}

function taggedTheme(): { fg(color: string, text: string): string; bold(text: string): string } {
	return {
		fg(color: string, text: string): string {
			return `<${color}>${text}</${color}>`;
		},
		bold(text: string): string {
			return `<bold>${text}</bold>`;
		},
	};
}

function renderMessageText(message: CustomMessage, width = 120): string {
	return renderHandoffListMessage(message, { expanded: false }, noopTheme()).render(width).join("\n");
}

async function withTempSkill<T>(callback: (skillPath: string) => Promise<T>): Promise<T> {
	const dir = await mkdtemp(join(tmpdir(), "handoff-save-skill-"));
	const skillPath = join(dir, "SKILL.md");
	await writeFile(
		skillPath,
		`---\nname: handoff-save\ndescription: Test skill\n---\n\n# handoff-save\n\nStore a handoff from the skill body.`,
		"utf8",
	);
	try {
		return await callback(skillPath);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

function skillCommandInfo(skillPath: string): CommandInfo {
	return {
		name: "skill:handoff-save",
		source: "skill",
		sourceInfo: {
			path: skillPath,
			source: "project",
			scope: "project",
			origin: "top-level",
		},
	};
}

describe("handoff extension", () => {
	test("registers only create pickup and list commands", () => {
		const pi = new FakePi();

		handoffExtension(pi);

		expect([...pi.commands.keys()].sort()).toEqual(["handoff:create", "handoff:list", "handoff:pickup"]);
		expect(pi.commands.has("handoff:load")).toBe(false);
		expect(pi.commands.has("brmem-handoff")).toBe(false);
		expect(pi.commands.has("brmem-pickup-handoff")).toBe(false);
		expect([...pi.renderers.keys()]).toEqual([HANDOFF_LIST_MESSAGE_TYPE]);
		expect(pi.commands.get("handoff:create")?.description).toBe("Create a directed handoff artifact for a future continuation.");
		expect(pi.commands.get("handoff:pickup")?.description).toBe("Pick up a saved handoff by slug, selector, or picker.");
		expect(pi.commands.get("handoff:list")?.description).toBe("List saved handoffs on this branch or across all branches.");
	});

	test("create command expands the handoff-save skill when available", async () => {
		await withTempSkill(async (skillPath) => {
			const result = await runCommand("handoff:create", "resume extension frontend work", [], {}, [
				skillCommandInfo(skillPath),
			]);

			result.pi.assertDone();
			expect(result.waitForIdleCalls()).toBe(1);
			expect(result.pi.sentUserMessages).toHaveLength(1);
			expect(result.pi.sentUserMessages[0]).toContain(`<skill name="handoff-save" location="${skillPath}">`);
			expect(result.pi.sentUserMessages[0]).toContain("Store a handoff from the skill body.");
			expect(result.pi.sentUserMessages[0]).toContain("resume extension frontend work");
			expect(result.notifications).toEqual([{ message: "Starting handoff save workflow…", level: "info" }]);
		});
	});

	test("create fallback uses the handoffs namespace and semantic slug key", async () => {
		const result = await runCommand("handoff:create", "handoff focus");

		result.pi.assertDone();
		expect(result.pi.sentUserMessages[0]).toContain("Storage contract:");
		expect(result.pi.sentUserMessages[0]).toContain("Namespace: `handoffs`");
		expect(result.pi.sentUserMessages[0]).toContain("brmem check <semantic-slug>.md --namespace handoffs --branch <branch>");
		expect(result.pi.sentUserMessages[0]).toContain("brmem put <semantic-slug>.md --namespace handoffs --branch <branch> --file /dev/stdin");
		expect(result.pi.sentUserMessages[0]).toContain("do not create a temporary artifact file");
		expect(result.pi.sentUserMessages[0]).toContain("HANDOFF_EOF");
		expect(result.pi.sentUserMessages[0]).toContain("handoff focus");
		expect(result.pi.sentUserMessages[0]).not.toContain("--file <artifact.md>");
		expect(result.pi.sentUserMessages[0]).not.toContain("Create a temporary Markdown file");
		expect(result.pi.sentUserMessages[0]).not.toContain("session-artifacts");
		expect(result.pi.sentUserMessages[0]).not.toContain("handoffs/<semantic-slug>");
		expect(result.notifications).toEqual([
			{ message: "handoff-save skill was not found; using fallback handoff-save workflow prompt.", level: "warning" },
		]);
	});

	test("create with no args prompts for focus and continues when supplied", async () => {
		const result = await runCommand("handoff:create", "", [], { inputResponse: "continue the list command" });

		result.pi.assertDone();
		expect(result.inputs).toEqual([
			{ title: "What should the future session continue from this handoff?", placeholder: undefined },
		]);
		expect(result.pi.sentUserMessages).toHaveLength(1);
		expect(result.pi.sentUserMessages[0]).toContain("continue the list command");
	});

	test("create with no args and cancelled input stops without save prompt", async () => {
		const result = await runCommand("handoff:create", "");

		result.pi.assertDone();
		expect(result.inputs).toHaveLength(1);
		expect(result.notifications).toEqual([{ message: "Continuation focus is required to save a handoff.", level: "warning" }]);
		expect(result.pi.sentUserMessages).toEqual([]);
	});

	test("create with no input UI asks the assistant to request focus without saving", async () => {
		const result = await runCommand("handoff:create", "", [], { hasUI: false, inputUnavailable: true });

		result.pi.assertDone();
		expect(result.pi.sentUserMessages).toEqual([
			"Ask the user exactly this question before saving a handoff: What should the future session continue from this handoff?\n\nDo not save a handoff until the user answers with a meaningful continuation focus.",
		]);
		expect(result.notifications).toEqual([]);
	});

	test("pickup command picks up an explicit slug from the current branch", async () => {
		const artifact = "# Handoff: Continue tests\n\n## Next Steps\n\nRun the tests.";
		const result = await runCommand("handoff:pickup", "continue-tests", [
			branchStep(),
			listStep(BRANCH, ["continue-tests.md"]),
			getStep(BRANCH, "continue-tests.md", artifact),
		]);

		result.pi.assertDone();
		expect(result.pi.execCalls).toEqual([
			{ command: "git", args: ["branch", "--show-current"], options: { cwd: ROOT, timeout: 10_000 } },
			{
				command: "brmem",
				args: ["list", "--namespace", "handoffs", "--branch", BRANCH, "--format", "json"],
				options: { cwd: ROOT, timeout: 30_000 },
			},
			{
				command: "brmem",
				args: ["get", "continue-tests.md", "--namespace", "handoffs", "--branch", BRANCH],
				options: { cwd: ROOT, timeout: 30_000 },
			},
		]);
		expect(result.selections).toEqual([]);
		expect(result.notifications.at(-1)).toEqual({ message: `Picked up handoff continue-tests from branch ${BRANCH}.`, level: "info" });
		expect(result.pi.sentUserMessages[0]).toContain(`Branch: ${BRANCH}`);
		expect(result.pi.sentUserMessages[0]).toContain("Namespace: handoffs");
		expect(result.pi.sentUserMessages[0]).toContain("Entry: continue-tests.md");
		expect(result.pi.sentUserMessages[0]).toContain(artifact);
		expect(result.pi.sentUserMessages[0]).not.toContain("session-artifacts");
	});

	test("pickup command uses an explicit branch and key without reading current branch", async () => {
		const result = await runCommand("handoff:pickup", "--branch other/branch foo.md", [
			listStep("other/branch", ["foo.md"]),
			getStep("other/branch", "foo.md", "# Handoff"),
		]);

		result.pi.assertDone();
		expect(result.pi.execCalls.map((call) => call.command)).toEqual(["brmem", "brmem"]);
		expect(result.pi.sentUserMessages[0]).toContain("Branch: other/branch");
		expect(result.pi.sentUserMessages[0]).toContain("Entry: foo.md");
	});

	test("pickup command opens a picker with slug and preview labels", async () => {
		const result = await runCommand(
			"handoff:pickup",
			"",
			[
				branchStep(),
				listStep(BRANCH, ["alpha.md", "bravo.md"]),
				getStep(BRANCH, "alpha.md", "Continuation focus: Alpha next step\n"),
				getStep(BRANCH, "bravo.md", "# Bravo title\n\nBody"),
				getStep(BRANCH, "bravo.md", "# Bravo title\n\nBody"),
			],
			{ selectIndex: 1 },
		);

		result.pi.assertDone();
		expect(result.selections).toEqual([
			{
				title: `Select handoff on ${BRANCH}`,
				items: ["alpha — Alpha next step", "bravo — Bravo title"],
			},
		]);
		expect(result.pi.sentUserMessages[0]).toContain("Entry: bravo.md");
	});

	test("pickup command asks for a slug when multiple handoffs exist without picker UI", async () => {
		const result = await runCommand(
			"handoff:pickup",
			"",
			[branchStep(), listStep(BRANCH, ["alpha.md", "bravo.md"])],
			{ hasUI: false },
		);

		result.pi.assertDone();
		expect(result.pi.sentUserMessages).toEqual([]);
		expect(result.notifications).toEqual([
			{
				message: `Found multiple handoffs on branch ${BRANCH}:\n\nalpha\nbravo\n\nRerun with a slug.`,
				level: "warning",
			},
		]);
	});

	test("list current branch sends a card-style custom message", async () => {
		const result = await runCommand("handoff:list", "", [
			branchStep(),
			listStep(BRANCH, ["address-review-feedback.md"]),
			getStep(BRANCH, "address-review-feedback.md", "Continuation focus: Address review feedback\n"),
		]);

		result.pi.assertDone();
		expect(result.pi.execCalls.map((call) => [call.command, call.args])).toEqual([
			["git", ["branch", "--show-current"]],
			["brmem", ["list", "--namespace", "handoffs", "--branch", BRANCH, "--format", "json"]],
			["brmem", ["get", "address-review-feedback.md", "--namespace", "handoffs", "--branch", BRANCH]],
		]);
		expect(result.notifications).toEqual([]);
		expect(result.pi.sentMessages).toHaveLength(1);

		const message = result.pi.sentMessages[0];
		expect(message).toEqual({
			customType: HANDOFF_LIST_MESSAGE_TYPE,
			content: `Handoffs on ${BRANCH}\n\n  1. address-review-feedback\n     Address review feedback\n     → /handoff:pickup address-review-feedback`,
			display: true,
			details: {
				mode: "branch",
				branch: BRANCH,
				items: [
					{
						branch: BRANCH,
						key: "address-review-feedback.md",
						slug: "address-review-feedback",
						preview: "Address review feedback",
					},
				],
			},
		});
		expect(message).toBeDefined();
		if (message === undefined) {
			throw new Error("list command did not send a message");
		}
		const rendered = renderMessageText(message);
		expect(rendered).toContain(`Handoffs on ${BRANCH}`);
		expect(rendered).toContain("address-review-feedback");
		expect(rendered).toContain("Address review feedback");
		expect(rendered).toContain("/handoff:pickup address-review-feedback");
		expect(rendered).not.toContain("address-review-feedback.md");
		expect(rendered).not.toContain("Slug | Preview");
	});

	test("list all branches sends grouped pickup commands", async () => {
		const result = await runCommand("handoff:list", "--all", [
			listAllStep([
				{ key: "alpha.md", branch: "feat/a" },
				{ key: "bravo.md", branch: "feat/b" },
			]),
			getStep("feat/a", "alpha.md", "# Alpha handoff\n"),
			getStep("feat/b", "bravo.md", "Continuation focus: Bravo work\n"),
		]);

		result.pi.assertDone();
		expect(result.pi.execCalls.map((call) => call.command)).toEqual(["brmem", "brmem", "brmem"]);
		expect(result.notifications).toEqual([]);
		expect(result.pi.sentMessages).toHaveLength(1);

		const message = result.pi.sentMessages[0];
		expect(message).toBeDefined();
		if (message === undefined) {
			throw new Error("list command did not send a message");
		}
		expect(message.details).toEqual({
			mode: "all-branches",
			items: [
				{ branch: "feat/a", key: "alpha.md", slug: "alpha", preview: "Alpha handoff" },
				{ branch: "feat/b", key: "bravo.md", slug: "bravo", preview: "Bravo work" },
			],
		});
		const rendered = renderMessageText(message);
		expect(rendered).toContain("Handoffs across branches");
		expect(rendered).toContain("feat/a\n  1. alpha");
		expect(rendered).toContain("→ /handoff:pickup --branch feat/a alpha");
		expect(rendered).toContain("feat/b\n  2. bravo");
		expect(rendered).toContain("→ /handoff:pickup --branch feat/b bravo");
		expect(rendered).not.toContain("Branch | Slug | Preview");
		expect(rendered).not.toContain("alpha.md");
	});

	test("list falls back to a notification when custom messages are unavailable", async () => {
		const result = await runCommand(
			"handoff:list",
			"",
			[
				branchStep(),
				listStep(BRANCH, ["address-review-feedback.md"]),
				getStep(BRANCH, "address-review-feedback.md", "Continuation focus: Address review feedback\n"),
			],
			{},
			[],
			{ sendMessage: false },
		);

		result.pi.assertDone();
		expect(result.pi.sentMessages).toEqual([]);
		expect(result.notifications).toEqual([
			{
				message: `Handoffs on ${BRANCH}\n\n  1. address-review-feedback\n     Address review feedback\n     → /handoff:pickup address-review-feedback`,
				level: "info",
			},
		]);
	});

	test("list parser rejects branch plus all branches", async () => {
		const result = await runCommand("handoff:list", "--branch feat/x --all");

		result.pi.assertDone();
		expect(result.pi.execCalls).toEqual([]);
		expect(result.notifications[0]?.message).toContain("--branch and --all are mutually exclusive.");
		expect(result.notifications[0]?.level).toBe("error");
	});

	test("list empty messages distinguish current branch and all branches", async () => {
		const current = await runCommand("handoff:list", "", [branchStep(), listStep(BRANCH, [])]);
		const all = await runCommand("handoff:list", "--all", [listAllStep([])]);

		current.pi.assertDone();
		all.pi.assertDone();
		expect(current.notifications).toContainEqual({ message: `No saved handoffs found on branch ${BRANCH}.`, level: "info" });
		expect(all.notifications).toContainEqual({ message: "No saved handoffs found across branches.", level: "info" });
	});
});

describe("handoff pure helpers", () => {
	test("parses pickup args", () => {
		expect(parsePickupHandoffArgs("--branch feature/x foo.md")).toEqual({
			help: false,
			branch: "feature/x",
			selector: ["foo.md"],
		});
		expect(parsePickupHandoffArgs("review feedback")).toEqual({ help: false, selector: ["review", "feedback"] });
		expect(() => parsePickupHandoffArgs("handoffs/foo.md")).toThrow("cannot contain '/'");
	});

	test("parses list args", () => {
		expect(parseListHandoffArgs("--branch=feature/x")).toEqual({
			help: false,
			branch: "feature/x",
			allBranches: false,
		});
		expect(parseListHandoffArgs("--all")).toEqual({ help: false, allBranches: true });
		expect(() => parseListHandoffArgs("--branch feature/x --all")).toThrow("mutually exclusive");
	});

	test("filters brmem list output to flat handoff markdown keys", () => {
		expect(
			parseHandoffKeysFromBrmemList(
				listJson(["bravo.md", "notes/ignore.md", "handoffs/old.md", "alpha.md", "bravo.md"]),
			),
		).toEqual(["alpha.md", "bravo.md"]);
	});

	test("resolves exact keys normalized slugs search terms and ambiguity", () => {
		const keys = ["address-review-feedback.md", "add-pickup-handoff-command.md"];
		expect(resolveHandoffKey(["address-review-feedback.md"], keys)).toEqual({
			key: "address-review-feedback.md",
		});
		expect(resolveHandoffKey(["add-pickup-handoff-command"], keys)).toEqual({
			key: "add-pickup-handoff-command.md",
		});
		expect(resolveHandoffKey(["review", "feedback"], keys)).toEqual({
			key: "address-review-feedback.md",
		});
		expect(resolveHandoffKey([], keys)).toEqual({ ambiguousKeys: keys });
		expect(resolveHandoffKey(["handoffs/address-review-feedback.md"], keys)).toEqual({});
	});

	test("pickup prompt fences artifacts that contain markdown fences", () => {
		const prompt = buildPickupHandoffPrompt(BRANCH, "foo.md", "```text\ninside\n```");

		expect(prompt).toContain("````markdown");
		expect(prompt).toContain("```text\ninside\n```");
		expect(prompt).toContain("Technical locator:");
		expect(prompt).toContain("Namespace: handoffs");
		expect(prompt).toContain("Entry: foo.md");
	});

	test("create prompt includes fallback and focus", () => {
		const prompt = buildCreateHandoffPrompt(undefined, "ship the frontend command");

		expect(prompt).toContain("Storage contract:");
		expect(prompt).toContain("ship the frontend command");
		expect(prompt).toContain("brmem check <semantic-slug>.md --namespace handoffs --branch <branch>");
		expect(prompt).toContain("brmem put <semantic-slug>.md --namespace handoffs --branch <branch> --file /dev/stdin");
		expect(prompt).toContain("HANDOFF_EOF");
		expect(prompt).not.toContain("--file <artifact.md>");
		expect(prompt).not.toContain("Create a temporary Markdown file");
	});

	test("preview prefers continuation focus and otherwise headings", () => {
		expect(deriveHandoffPreview("Continuation focus: Finish the tests\n# Later")).toBe("Finish the tests");
		expect(deriveHandoffPreview("# Handoff: Continue docs\n\nBody")).toBe("Handoff: Continue docs");
	});

	test("formats handoff list cards and pickup commands without storage keys", () => {
		const item: HandoffListMessageItem = {
			branch: "feature/docs",
			key: "ship-docs.md",
			slug: "ship-docs",
			preview: "Ship the docs update",
		};
		const details: HandoffListMessageDetails = { mode: "branch", branch: "feature/docs", items: [item] };

		expect(formatHandoffPickupCommand(item, "branch")).toBe("/handoff:pickup ship-docs");
		expect(formatHandoffPickupCommand(item, "all-branches")).toBe("/handoff:pickup --branch feature/docs ship-docs");
		expect(formatHandoffListPlain(details)).toBe(
			"Handoffs on feature/docs\n\n  1. ship-docs\n     Ship the docs update\n     → /handoff:pickup ship-docs",
		);
		expect(formatHandoffListPlain(details)).not.toContain("ship-docs.md");
	});

	test("groups all-branches list items with stable numbering", () => {
		const alpha: HandoffListMessageItem = { branch: "feat/a", key: "alpha.md", slug: "alpha", preview: "Alpha" };
		const aardvark: HandoffListMessageItem = { branch: "feat/a", key: "aardvark.md", slug: "aardvark", preview: "Aardvark" };
		const bravo: HandoffListMessageItem = { branch: "feat/b", key: "bravo.md", slug: "bravo", preview: "Bravo" };
		const items = [alpha, aardvark, bravo];

		expect(groupHandoffListItemsByBranch(items)).toEqual([
			{
				branch: "feat/a",
				items: [
					{ index: 1, item: alpha },
					{ index: 2, item: aardvark },
				],
			},
			{ branch: "feat/b", items: [{ index: 3, item: bravo }] },
		]);
	});

	test("renderer falls back to content for malformed details", () => {
		const component = renderHandoffListMessage(
			{ customType: HANDOFF_LIST_MESSAGE_TYPE, content: "line one\nline two", display: true, details: { mode: "branch" } },
			{ expanded: false },
			noopTheme(),
		);

		expect(component.render(20)).toEqual(["line one", "line two"]);
	});

	test("renderer truncates display lines to the available width", () => {
		const details: HandoffListMessageDetails = {
			mode: "branch",
			branch: "feature/with-a-very-long-branch-name",
			items: [
				{
					branch: "feature/with-a-very-long-branch-name",
					key: "very-long-handoff-slug.md",
					slug: "very-long-handoff-slug",
					preview: "This preview is intentionally too long for the target render width",
				},
			],
		};
		const component = renderHandoffListMessage(
			{ customType: HANDOFF_LIST_MESSAGE_TYPE, content: formatHandoffListPlain(details), display: true, details },
			{ expanded: false },
			noopTheme(),
		);

		expect(component.render(24)).toContain("Handoffs on feature/wit…");
		expect(component.render(24).some((line) => line.endsWith("…"))).toBe(true);
	});

	test("renderer applies theme colors to header slug branch and command", () => {
		const details: HandoffListMessageDetails = {
			mode: "all-branches",
			items: [{ branch: "feat/a", key: "alpha.md", slug: "alpha", preview: "Alpha work" }],
		};
		const component = renderHandoffListMessage(
			{ customType: HANDOFF_LIST_MESSAGE_TYPE, content: formatHandoffListPlain(details), display: true, details },
			{ expanded: false },
			taggedTheme(),
		);

		expect(component.render(120)).toEqual([
			"<accent><bold>Handoffs across branches</bold></accent>",
			"",
			"<accent>feat/a</accent>",
			"<dim>  1. </dim><accent><bold>alpha</bold></accent>",
			"     Alpha work",
			"<muted>     → /handoff:pickup --branch feat/a alpha</muted>",
		]);
	});
});
