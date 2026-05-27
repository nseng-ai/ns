import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { formatCommand, tailText, type ExecResult } from "./command-runtime.ts";
import { expandSkillBlock } from "./skill-expansion.ts";
import { parseObjectiveList, type ObjectiveList, type ObjectiveListRecord } from "./objective-list.ts";
import {
	VIEW_OTHER_OBJECTIVES_CHOICE,
	changedActiveObjectiveSelection,
	objectiveChoiceMap,
	objectiveDiffPickerTitle,
	objectiveRecordsWithChangedFirst,
	parseObjectiveDiffChangedSlugs,
	parseObjectiveStatusChangedSlugs,
	type ObjectiveDiffSelection,
} from "./objective-picker.ts";

export type { ExecResult } from "./command-runtime.ts";

const OBJECTIVE_LIST_TIMEOUT_MS = 30_000;
const OBJECTIVE_DIFF_TIMEOUT_MS = 30_000;
const OBJECTIVE_STATUS_TIMEOUT_MS = 30_000;
const MAX_ERROR_CHARS = 4_000;
const OBJECTIVE_LIST_COMMAND_NAME = "objective-list";
const OBJECTIVE_LIST_MESSAGE_TYPE = "objective-list-output";

const OBJECTIVE_LIST_USAGE = `Usage: /objective-list [--names] [--status all|active|open|closed] [--help]

Shows \`objective list\` output in chat. Output format is controlled by the Pi extension; --format and --json-schema are not supported.`;

const OBJECTIVE_LIST_ARG_COMPLETIONS = ["--names", "--status", "--help", "-h"] as const;
const OBJECTIVE_LIST_STATUS_VALUES = ["all", "active", "open", "closed"] as const;

export type NotifyLevel = "info" | "warning" | "error";

export type AutocompleteItem = {
	value: string;
	label?: string;
	description?: string;
};

type CustomMessageContent = string | Array<{ type: string; text?: string }>;

type CustomMessage = {
	customType: string;
	content: CustomMessageContent;
	display: boolean;
	details?: unknown;
};

type CommandInfo = {
	name: string;
	source: string;
	sourceInfo: {
		path: string;
		source?: string;
		scope?: string;
		origin?: string;
		baseDir?: string;
	};
};

export type CommandContext = {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		select(title: string, items: string[]): Promise<string | undefined>;
		setStatus(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
};

export type ExtensionAPI = {
	registerCommand(
		name: string,
		options: {
			description?: string;
			getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult>;
	getCommands(): CommandInfo[];
	sendMessage?(message: CustomMessage, options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" }): void;
	sendUserMessage(content: string): void;
};

type ObjectiveCommandName = "objective-next" | "objective-current" | "objective-update";

type ObjectiveSelectionSpec = {
	statusKey: string;
	selectionTitle: string;
	compactDiffSuggestion?: boolean;
};

type ObjectiveCommandSpec = ObjectiveSelectionSpec & {
	commandName: ObjectiveCommandName;
	skillName: ObjectiveCommandName;
	description: string;
	fallbackPrompt: string;
	actionPrompt: string;
};

type ObjectiveStackImplCommandSpec = ObjectiveSelectionSpec & {
	commandName: "objective-stack-impl";
	description: string;
	promptTemplateName: "objective-stack-impl";
};

export type ObjectiveListParsedArgs = {
	args: string[];
	help: boolean;
};

type ObjectiveListMessageDetails = {
	status: "success" | "failure" | "rejected";
	command: string;
	args: string[];
	cwd: string;
	code?: number;
	killed?: boolean;
	stdoutChars?: number;
	stderrChars?: number;
};

class ObjectiveListUsageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ObjectiveListUsageError";
	}
}

const OBJECTIVE_COMMANDS: ObjectiveCommandSpec[] = [
	{
		commandName: "objective-next",
		skillName: "objective-next",
		description: "Pick an active Objective, then invoke objective-next for the selected slug.",
		statusKey: "objective-next",
		selectionTitle: "Select an active Objective for next-work recommendation",
		fallbackPrompt:
			"The objective-next skill was not found among loaded Pi skills. Follow the repository's Objective workflow anyway: recommend the next useful work for the explicit Objective below. If likely unrecorded progress blocks the recommendation, ask whether to run objective-update for the same Objective and only mutate through that explicit handoff.",
		actionPrompt: "Run objective-next for this explicitly selected Objective slug or path:",
		compactDiffSuggestion: true,
	},
	{
		commandName: "objective-current",
		skillName: "objective-current",
		description: "Pick an active Objective, then invoke objective-current for the selected slug.",
		statusKey: "objective-current",
		selectionTitle: "Select an active Objective to summarize",
		fallbackPrompt:
			"The objective-current skill was not found among loaded Pi skills. Follow the repository's Objective workflow anyway: summarize the current state of the explicit Objective below without mutating files.",
		actionPrompt: "Run objective-current for this explicitly selected Objective slug or path:",
	},
	{
		commandName: "objective-update",
		skillName: "objective-update",
		description: "Pick an active Objective, then invoke objective-update for the selected slug.",
		statusKey: "objective-update",
		selectionTitle: "Select an active Objective to update",
		fallbackPrompt:
			"The objective-update skill was not found among loaded Pi skills. Follow the repository's Objective workflow anyway: update tracking for exactly one explicit Objective below.",
		actionPrompt: "Run objective-update for this explicitly selected Objective slug or path:",
	},
];

const OBJECTIVE_STACK_IMPL_COMMAND: ObjectiveStackImplCommandSpec = {
	commandName: "objective-stack-impl",
	description: "Pick an active Objective, then invoke the Objective stack implementation prompt for the selected slug.",
	statusKey: "objective-stack-impl",
	selectionTitle: "Select an active Objective for stack implementation",
	compactDiffSuggestion: true,
	promptTemplateName: "objective-stack-impl",
};

function stripPromptTemplateFrontmatter(markdown: string): string {
	return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

function truncateTail(text: string, maxChars: number): string {
	const tail = tailText(text, { maxChars });
	if (tail === text) {
		return text;
	}

	return `[Output truncated to the last ${maxChars} characters.]\n\n${tail.slice(1)}`;
}

function formatExecFailure(commandDisplay: string, result: ExecResult): string {
	const status = result.killed ? `exit code ${result.code}; process was killed or timed out` : `exit code ${result.code}`;
	const stdout = result.stdout.trimEnd() || "(empty)";
	const stderr = result.stderr.trimEnd() || "(empty)";
	return truncateTail(
		`objective command failed (${status}).\n\n$ ${commandDisplay}\n\nstdout:\n${stdout}\n\nstderr:\n${stderr}`,
		MAX_ERROR_CHARS,
	);
}

function formatExecStartupFailure(commandDisplay: string, error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return truncateTail(`objective command failed before completion.\n\n$ ${commandDisplay}\n\nerror:\n${message}`, MAX_ERROR_CHARS);
}

async function listActiveObjectives(
	pi: ExtensionAPI,
	ctx: CommandContext,
	spec: ObjectiveSelectionSpec,
): Promise<ObjectiveList> {
	if (ctx.hasUI) {
		ctx.ui.setStatus(spec.statusKey, "listing active Objectives…");
	}

	const args = ["list", "--format", "json"];
	try {
		const result = await pi.exec("objective", args, {
			cwd: ctx.cwd,
			timeout: OBJECTIVE_LIST_TIMEOUT_MS,
		});
		if (result.code !== 0 || result.killed) {
			throw new Error(formatExecFailure(formatCommand("objective", args), result));
		}

		return parseObjectiveList(result.stdout);
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus(spec.statusKey, undefined);
		}
	}
}

async function changedObjectiveSelection(
	pi: ExtensionAPI,
	ctx: CommandContext,
	objectiveList: ObjectiveList,
	spec: ObjectiveSelectionSpec,
): Promise<ObjectiveDiffSelection | undefined> {
	const trunkBranch = objectiveList.trunkBranch.trim();
	const committedChangedSlugs = trunkBranch
		? await objectiveDiffChangedSlugs(pi, ctx, spec, trunkBranch)
		: [];
	const dirtyChangedSlugs = await objectiveStatusChangedSlugs(pi, ctx, spec);
	const allChangedSlugs = sortedUniqueSlugs([...committedChangedSlugs, ...dirtyChangedSlugs]);
	const dirtyChangedSlugSet = new Set(dirtyChangedSlugs);
	const dirtyActiveSlugs = objectiveList.records.filter((record) => dirtyChangedSlugSet.has(record.slug));
	const changeBasisLabel = dirtyActiveSlugs.length > 0
		? trunkBranch
			? `changed in checkout or vs ${trunkBranch}`
			: "changed in checkout"
		: trunkBranch
			? `changed vs ${trunkBranch}`
			: "changed";

	return changedActiveObjectiveSelection(objectiveList, trunkBranch, allChangedSlugs, changeBasisLabel);
}

async function objectiveDiffChangedSlugs(
	pi: ExtensionAPI,
	ctx: CommandContext,
	spec: ObjectiveSelectionSpec,
	trunkBranch: string,
): Promise<string[]> {
	const args = ["diff", "--name-status", "-M", `${trunkBranch}...HEAD`, "--", ".asdl/objectives"];
	if (ctx.hasUI) {
		ctx.ui.setStatus(spec.statusKey, `checking Objective diff vs ${trunkBranch}…`);
	}

	try {
		const result = await pi.exec("git", args, {
			cwd: ctx.cwd,
			timeout: OBJECTIVE_DIFF_TIMEOUT_MS,
		});
		if (result.code !== 0 || result.killed) {
			return [];
		}

		return parseObjectiveDiffChangedSlugs(result.stdout);
	} catch {
		return [];
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus(spec.statusKey, undefined);
		}
	}
}

async function objectiveStatusChangedSlugs(
	pi: ExtensionAPI,
	ctx: CommandContext,
	spec: ObjectiveSelectionSpec,
): Promise<string[]> {
	const args = ["status", "--porcelain=v1", "-z", "--", ".asdl/objectives"];
	if (ctx.hasUI) {
		ctx.ui.setStatus(spec.statusKey, "checking checkout Objective changes…");
	}

	try {
		const result = await pi.exec("git", args, {
			cwd: ctx.cwd,
			timeout: OBJECTIVE_STATUS_TIMEOUT_MS,
		});
		if (result.code !== 0 || result.killed) {
			return [];
		}

		return parseObjectiveStatusChangedSlugs(result.stdout);
	} catch {
		return [];
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus(spec.statusKey, undefined);
		}
	}
}

function sortedUniqueSlugs(slugs: string[]): string[] {
	return [...new Set(slugs)].sort((left, right) => left.localeCompare(right));
}

function changedSelectionNotificationBasis(selection: ObjectiveDiffSelection): string {
	const committedDiffLabel = selection.trunkBranch ? `changed vs ${selection.trunkBranch}` : "";
	if (selection.changeBasisLabel === committedDiffLabel) {
		return `from objective diff vs ${selection.trunkBranch}`;
	}

	return `with changes ${selection.changeBasisLabel.replace(/^changed\s+/, "")}`;
}

function buildObjectiveSkillPrompt(
	spec: ObjectiveCommandSpec,
	skillBlock: string | undefined,
	objective: string,
): string {
	const updateReminder =
		spec.skillName === "objective-update"
			? "\nAfter this explicit selection, follow objective-update's normal post-selection evidence workflow."
			: "";

	return `${skillBlock ?? spec.fallbackPrompt}

${spec.actionPrompt}

\`\`\`text
${objective}
\`\`\`

Treat this as an explicit user selection. Do not auto-select a different Objective.${updateReminder}`;
}

function findPromptTemplatePath(pi: ExtensionAPI, ctx: CommandContext, promptTemplateName: string): string {
	const command = pi
		.getCommands()
		.find((candidate) => candidate.source === "prompt" && candidate.name === promptTemplateName);
	return command?.sourceInfo.path ?? resolve(ctx.cwd, ".pi/prompts", `${promptTemplateName}.md`);
}

export function buildObjectiveStackImplPrompt(templateMarkdown: string, objective: string): string {
	return stripPromptTemplateFrontmatter(templateMarkdown).replace(/\$ARGUMENTS/g, () => objective);
}

function formatPromptTemplateReadError(promptTemplateName: string, promptPath: string, error: unknown): string {
	const detail = error instanceof Error ? error.message : String(error);
	return `Failed to read /${promptTemplateName} prompt template at ${promptPath}: ${detail}`;
}

async function invokeObjectiveStackImplPrompt(
	pi: ExtensionAPI,
	ctx: CommandContext,
	spec: ObjectiveStackImplCommandSpec,
	objective: string,
): Promise<void> {
	await ctx.waitForIdle();

	const promptPath = findPromptTemplatePath(pi, ctx, spec.promptTemplateName);
	let templateMarkdown: string;
	try {
		templateMarkdown = await readFile(promptPath, "utf8");
	} catch (error) {
		if (ctx.hasUI) {
			ctx.ui.notify(formatPromptTemplateReadError(spec.promptTemplateName, promptPath, error), "error");
		}
		return;
	}

	if (ctx.hasUI) {
		ctx.ui.notify(`Invoking ${spec.commandName} for ${objective}.`, "info");
	}

	pi.sendUserMessage(buildObjectiveStackImplPrompt(templateMarkdown, objective));
}

async function selectObjectiveSlug(
	ctx: CommandContext,
	title: string,
	records: ObjectiveListRecord[],
	selection: ObjectiveDiffSelection | undefined,
): Promise<string | undefined> {
	const choices = objectiveChoiceMap(records, selection);
	const selected = await ctx.ui.select(title, [...choices.keys()]);
	if (!selected) {
		ctx.ui.notify("Objective selection cancelled.", "info");
		return undefined;
	}

	const slug = choices.get(selected);
	if (!slug) {
		ctx.ui.notify("Objective selection could not be resolved.", "error");
		return undefined;
	}

	return slug;
}

async function selectChangedObjectivesOrOther(
	ctx: CommandContext,
	spec: ObjectiveSelectionSpec,
	objectiveList: ObjectiveList,
	selection: ObjectiveDiffSelection,
): Promise<string | undefined> {
	const changedSet = new Set(selection.changedActiveSlugs);
	const changedRecords = objectiveList.records.filter((record) => changedSet.has(record.slug));
	const otherRecords = objectiveList.records.filter((record) => !changedSet.has(record.slug));
	if (changedRecords.length === 0) {
		return selectObjectiveSlug(ctx, spec.selectionTitle, objectiveList.records, undefined);
	}

	const choices = objectiveChoiceMap(changedRecords, selection);
	const items = [...choices.keys()];
	if (otherRecords.length > 0) {
		items.push(VIEW_OTHER_OBJECTIVES_CHOICE);
	}

	const selected = await ctx.ui.select(objectiveDiffPickerTitle(spec.selectionTitle, selection), items);
	if (!selected) {
		ctx.ui.notify("Objective selection cancelled.", "info");
		return undefined;
	}

	if (selected === VIEW_OTHER_OBJECTIVES_CHOICE) {
		return selectObjectiveSlug(ctx, `${spec.selectionTitle} (other active Objectives)`, otherRecords, undefined);
	}

	const slug = choices.get(selected);
	if (!slug) {
		ctx.ui.notify("Objective selection could not be resolved.", "error");
		return undefined;
	}

	return slug;
}

async function invokeObjectiveSkill(
	pi: ExtensionAPI,
	ctx: CommandContext,
	spec: ObjectiveCommandSpec,
	objective: string,
): Promise<void> {
	await ctx.waitForIdle();

	const skill = await expandSkillBlock(pi, spec.skillName);
	if (ctx.hasUI) {
		ctx.ui.notify(
			skill
				? `Invoking ${skill.name} for ${objective}.`
				: `${spec.skillName} skill was not found; using fallback prompt.`,
			skill ? "info" : "warning",
		);
	}

	pi.sendUserMessage(buildObjectiveSkillPrompt(spec, skill?.block, objective));
}

async function chooseActiveObjectiveSlug(
	pi: ExtensionAPI,
	ctx: CommandContext,
	spec: ObjectiveSelectionSpec,
): Promise<string | undefined> {
	await ctx.waitForIdle();

	const objectiveList = await listActiveObjectives(pi, ctx, spec);
	if (objectiveList.records.length === 0) {
		if (ctx.hasUI) {
			ctx.ui.notify("No active Objectives. Create one with /skill:objective-create.", "info");
		}
		return undefined;
	}

	if (!ctx.hasUI) {
		return undefined;
	}

	const changedSelection = await changedObjectiveSelection(pi, ctx, objectiveList, spec);
	if (changedSelection && spec.compactDiffSuggestion) {
		return selectChangedObjectivesOrOther(ctx, spec, objectiveList, changedSelection);
	}

	if (changedSelection) {
		const plural = changedSelection.changedActiveSlugs.length === 1 ? "" : "s";
		const basis = changedSelectionNotificationBasis(changedSelection);
		ctx.ui.notify(
			`Found changed Objective${plural} ${changedSelection.changedActiveSlugs.join(", ")} ${basis}.`,
			"info",
		);
	}
	return selectObjectiveSlug(
		ctx,
		spec.selectionTitle,
		objectiveRecordsWithChangedFirst(objectiveList.records, changedSelection),
		changedSelection,
	);
}

async function chooseObjectiveAndInvoke(
	pi: ExtensionAPI,
	ctx: CommandContext,
	spec: ObjectiveCommandSpec,
): Promise<void> {
	const slug = await chooseActiveObjectiveSlug(pi, ctx, spec);
	if (!slug) {
		return;
	}

	await invokeObjectiveSkill(pi, ctx, spec, slug);
}

async function handleObjectiveCommand(
	pi: ExtensionAPI,
	spec: ObjectiveCommandSpec,
	args: string,
	ctx: CommandContext,
): Promise<void> {
	const explicitObjective = args.trim();
	try {
		if (explicitObjective) {
			await invokeObjectiveSkill(pi, ctx, spec, explicitObjective);
			return;
		}

		await chooseObjectiveAndInvoke(pi, ctx, spec);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (ctx.hasUI) {
			ctx.ui.notify(message, "error");
		}
	}
}

async function handleObjectiveStackImplCommand(
	pi: ExtensionAPI,
	spec: ObjectiveStackImplCommandSpec,
	args: string,
	ctx: CommandContext,
): Promise<void> {
	const explicitObjective = args.trim();
	try {
		if (explicitObjective) {
			await invokeObjectiveStackImplPrompt(pi, ctx, spec, explicitObjective);
			return;
		}

		const slug = await chooseActiveObjectiveSlug(pi, ctx, spec);
		if (!slug) {
			return;
		}

		await invokeObjectiveStackImplPrompt(pi, ctx, spec, slug);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (ctx.hasUI) {
			ctx.ui.notify(message, "error");
		}
	}
}

function tokenizeArgumentString(args: string): string[] {
	return args.trim().split(/\s+/).filter(Boolean);
}

export function parseObjectiveListArgs(rawArgs: string): ObjectiveListParsedArgs {
	const tokens = tokenizeArgumentString(rawArgs);
	assertNoForbiddenObjectiveListArgs(tokens);

	const args: string[] = [];
	let help = false;
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index] ?? "";
		if (token === "--help" || token === "-h") {
			help = true;
			continue;
		}
		if (token === "--names") {
			args.push(token);
			continue;
		}
		if (token === "--status") {
			const value = tokens[index + 1];
			if (!value || value.startsWith("--")) {
				throw new ObjectiveListUsageError("--status requires one of: all, active, open, closed.");
			}
			args.push("--status", parseObjectiveListStatus(value));
			index += 1;
			continue;
		}
		if (token.startsWith("--status=")) {
			args.push("--status", parseObjectiveListStatus(token.slice("--status=".length)));
			continue;
		}
		if (token === "--current" || token.startsWith("--current=")) {
			throw new ObjectiveListUsageError(
				"--current is no longer supported by the checkout-local Objective list command.",
			);
		}
		if (token === "--view" || token.startsWith("--view=")) {
			throw new ObjectiveListUsageError(
				"--view is no longer supported by the checkout-local Objective list command.",
			);
		}

		throw new ObjectiveListUsageError(`Unsupported /${OBJECTIVE_LIST_COMMAND_NAME} argument: ${token}.`);
	}

	return { args, help };
}

function assertNoForbiddenObjectiveListArgs(tokens: string[]): void {
	for (const token of tokens) {
		if (token === "--format" || token.startsWith("--format=")) {
			throw new ObjectiveListUsageError("--format is controlled by the Pi extension and is not supported here.");
		}
		if (token === "--json-schema" || token.startsWith("--json-schema=")) {
			throw new ObjectiveListUsageError("--json-schema is not supported by /objective-list.");
		}
	}
}

function parseObjectiveListStatus(value: string): (typeof OBJECTIVE_LIST_STATUS_VALUES)[number] {
	if ((OBJECTIVE_LIST_STATUS_VALUES as readonly string[]).includes(value)) {
		return value as (typeof OBJECTIVE_LIST_STATUS_VALUES)[number];
	}

	throw new ObjectiveListUsageError(
		`Unsupported --status value: ${value || "(empty)"}. Expected all, active, open, or closed.`,
	);
}

function objectiveListUsage(error: string): string {
	return `Error: ${error}\n\n${OBJECTIVE_LIST_USAGE}`;
}

export function completeObjectiveListArgs(prefix: string): AutocompleteItem[] | null {
	const tokens = tokenizeArgumentString(prefix);
	const endsWithWhitespace = /\s$/.test(prefix);
	const currentToken = endsWithWhitespace ? "" : (tokens[tokens.length - 1] ?? "");
	const previousToken = endsWithWhitespace ? tokens[tokens.length - 1] : tokens[tokens.length - 2];

	if (currentToken.startsWith("--status=")) {
		const valuePrefix = currentToken.slice("--status=".length);
		return matchingCompletions(
			OBJECTIVE_LIST_STATUS_VALUES.map((value) => `--status=${value}`),
			`--status=${valuePrefix}`,
		);
	}

	const candidates = previousToken === "--status" ? OBJECTIVE_LIST_STATUS_VALUES : OBJECTIVE_LIST_ARG_COMPLETIONS;
	return matchingCompletions(candidates, currentToken);
}

function matchingCompletions(candidates: readonly string[], currentToken: string): AutocompleteItem[] | null {
	const filtered = candidates.filter((candidate) => candidate.startsWith(currentToken));
	return filtered.length > 0 ? filtered.map((value) => ({ value, label: value })) : null;
}

async function handleObjectiveListCommand(pi: ExtensionAPI, rawArgs: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();

	let parsedArgs: ObjectiveListParsedArgs;
	try {
		parsedArgs = parseObjectiveListArgs(rawArgs);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		presentObjectiveListMessage(pi, ctx, objectiveListUsage(message), {
			status: "rejected",
			command: OBJECTIVE_LIST_COMMAND_NAME,
			args: tokenizeArgumentString(rawArgs),
			cwd: ctx.cwd,
		}, "warning");
		return;
	}

	const commandArgs = parsedArgs.help ? ["list", "--help"] : ["list", ...parsedArgs.args, "--format", "markdown"];
	const commandDisplay = formatCommand("objective", commandArgs);

	if (ctx.hasUI) {
		ctx.ui.setStatus(OBJECTIVE_LIST_COMMAND_NAME, `running ${commandDisplay}…`);
	}

	let result: ExecResult;
	try {
		result = await pi.exec("objective", commandArgs, {
			cwd: ctx.cwd,
			timeout: OBJECTIVE_LIST_TIMEOUT_MS,
		});
	} catch (error) {
		presentObjectiveListMessage(pi, ctx, formatExecStartupFailure(commandDisplay, error), {
			status: "failure",
			command: commandDisplay,
			args: commandArgs,
			cwd: ctx.cwd,
		}, "error");
		return;
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus(OBJECTIVE_LIST_COMMAND_NAME, undefined);
		}
	}

	if (result.code !== 0 || result.killed) {
		presentObjectiveListMessage(pi, ctx, formatExecFailure(commandDisplay, result), objectiveListDetails("failure", commandDisplay, commandArgs, ctx, result), "error");
		return;
	}

	presentObjectiveListMessage(pi, ctx, objectiveListOutputContent(result), objectiveListDetails("success", commandDisplay, commandArgs, ctx, result), "info");
}

function objectiveListDetails(
	status: "success" | "failure",
	command: string,
	args: string[],
	ctx: CommandContext,
	result: ExecResult,
): ObjectiveListMessageDetails {
	return {
		status,
		command,
		args,
		cwd: ctx.cwd,
		code: result.code,
		killed: result.killed,
		stdoutChars: result.stdout.length,
		stderrChars: result.stderr.length,
	};
}

function objectiveListOutputContent(result: ExecResult): string {
	const stdout = result.stdout.trimEnd();
	if (stdout) {
		return stdout;
	}

	const stderr = result.stderr.trimEnd();
	return stderr || "(empty)";
}

function presentObjectiveListMessage(
	pi: ExtensionAPI,
	ctx: CommandContext,
	content: string,
	details: ObjectiveListMessageDetails,
	level: NotifyLevel,
): void {
	if (pi.sendMessage) {
		pi.sendMessage({
			customType: OBJECTIVE_LIST_MESSAGE_TYPE,
			content,
			display: true,
			details,
		});
		return;
	}

	if (ctx.hasUI) {
		ctx.ui.notify(content, level);
		return;
	}

	if (level === "error") {
		console.error(content);
		return;
	}

	console.log(content);
}

export default function objectiveExtension(pi: ExtensionAPI): void {
	pi.registerCommand(OBJECTIVE_LIST_COMMAND_NAME, {
		description: "List active Objectives in this repository without invoking the agent.",
		getArgumentCompletions: completeObjectiveListArgs,
		handler: async (args, ctx) => handleObjectiveListCommand(pi, args, ctx),
	});

	for (const spec of OBJECTIVE_COMMANDS) {
		pi.registerCommand(spec.commandName, {
			description: spec.description,
			handler: async (args, ctx) => handleObjectiveCommand(pi, spec, args, ctx),
		});
	}

	pi.registerCommand(OBJECTIVE_STACK_IMPL_COMMAND.commandName, {
		description: OBJECTIVE_STACK_IMPL_COMMAND.description,
		handler: async (args, ctx) => handleObjectiveStackImplCommand(pi, OBJECTIVE_STACK_IMPL_COMMAND, args, ctx),
	});
}
