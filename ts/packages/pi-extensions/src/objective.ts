import { readFile } from "node:fs/promises";
import { dirname } from "node:path";

const OBJECTIVE_LIST_TIMEOUT_MS = 30_000;
const OBJECTIVE_DIFF_TIMEOUT_MS = 30_000;
const MAX_ERROR_CHARS = 4_000;
const OBJECTIVE_LIST_COMMAND_NAME = "objective-list";
const OBJECTIVE_LIST_MESSAGE_TYPE = "objective-list-output";

const OBJECTIVE_LIST_USAGE = `Usage: /objective-list [--current] [--names] [--view list|detail] [--help]

Shows \`objective list\` output in chat. Output format is controlled by the Pi extension; --format and --json-schema are not supported.`;

const OBJECTIVE_LIST_ARG_COMPLETIONS = ["--current", "--names", "--view", "--help", "-h"] as const;
const OBJECTIVE_LIST_VIEW_VALUES = ["list", "detail"] as const;

export type NotifyLevel = "info" | "warning" | "error";

export type ExecResult = {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
};

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

type ObjectiveCommandSpec = {
	commandName: ObjectiveCommandName;
	skillName: ObjectiveCommandName;
	description: string;
	statusKey: string;
	selectionTitle: string;
	fallbackPrompt: string;
	actionPrompt: string;
};

export type ObjectiveBranchEntry = {
	branch: string;
	tipHeadIso: string | null;
	aheadTrunk: number;
};

export type ObjectiveListGroup = {
	slug: string;
	branches: ObjectiveBranchEntry[];
};

export type ObjectiveList = {
	trunkBranch: string;
	view: string;
	currentBranch: string | null;
	filteredToCurrent: boolean;
	namesOnly: boolean;
	groups: ObjectiveListGroup[];
};

export type ObjectiveDiffSuggestion = {
	slug: string;
	trunkBranch: string;
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
		description: "Pick an open Objective, then invoke objective-next for the selected slug.",
		statusKey: "objective-next",
		selectionTitle: "Select an open Objective for next-work recommendation",
		fallbackPrompt:
			"The objective-next skill was not found among loaded Pi skills. Follow the repository's Objective workflow anyway: recommend the next useful work for the explicit Objective below without mutating files.",
		actionPrompt: "Run objective-next for this explicitly selected Objective slug or path:",
	},
	{
		commandName: "objective-current",
		skillName: "objective-current",
		description: "Pick an open Objective, then invoke objective-current for the selected slug.",
		statusKey: "objective-current",
		selectionTitle: "Select an open Objective to summarize",
		fallbackPrompt:
			"The objective-current skill was not found among loaded Pi skills. Follow the repository's Objective workflow anyway: summarize the current state of the explicit Objective below without mutating files.",
		actionPrompt: "Run objective-current for this explicitly selected Objective slug or path:",
	},
	{
		commandName: "objective-update",
		skillName: "objective-update",
		description: "Pick an open Objective, then invoke objective-update for the selected slug.",
		statusKey: "objective-update",
		selectionTitle: "Select an open Objective to update",
		fallbackPrompt:
			"The objective-update skill was not found among loaded Pi skills. Follow the repository's Objective workflow anyway: update tracking for exactly one explicit Objective below.",
		actionPrompt: "Run objective-update for this explicitly selected Objective slug or path:",
	},
];

function stripFrontmatter(markdown: string): string {
	return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

function truncateTail(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text;
	}

	return `[Output truncated to the last ${maxChars} characters.]\n\n${text.slice(text.length - maxChars)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseObjectiveBranchEntry(value: unknown, groupIndex: number, branchIndex: number): ObjectiveBranchEntry {
	if (!isRecord(value)) {
		throw new Error(
			`Invalid Objective list branch at group ${groupIndex}, branch ${branchIndex}: expected an object.`,
		);
	}

	const branch = value.branch;
	const tipHeadIso = value.tip_head_iso;
	const aheadTrunk = value.ahead_trunk;
	if (
		typeof branch !== "string" ||
		(tipHeadIso !== null && typeof tipHeadIso !== "string") ||
		typeof aheadTrunk !== "number" ||
		!Number.isFinite(aheadTrunk)
	) {
		throw new Error(
			`Invalid Objective list branch at group ${groupIndex}, branch ${branchIndex}: expected branch, tip_head_iso, and ahead_trunk.`,
		);
	}

	return { branch, tipHeadIso, aheadTrunk };
}

function parseObjectiveListGroup(value: unknown, index: number): ObjectiveListGroup {
	if (!isRecord(value)) {
		throw new Error(`Invalid Objective list group at index ${index}: expected an object.`);
	}

	const slug = value.slug;
	const branches = value.branches;
	if (typeof slug !== "string" || !Array.isArray(branches)) {
		throw new Error(`Invalid Objective list group at index ${index}: expected slug and branches.`);
	}

	return {
		slug,
		branches: branches.map((branch, branchIndex) => parseObjectiveBranchEntry(branch, index, branchIndex)),
	};
}

export function parseObjectiveList(stdout: string): ObjectiveList {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to parse objective list JSON: ${message}`);
	}

	if (!isRecord(parsed)) {
		throw new Error("Invalid objective list JSON: expected an envelope object.");
	}

	const envelopeExitCode = parsed.exit_code;
	if (typeof envelopeExitCode === "number" && envelopeExitCode !== 0) {
		throw new Error(`objective list returned envelope exit_code ${envelopeExitCode}.`);
	}

	const data = parsed.data;
	if (!isRecord(data)) {
		throw new Error("Invalid objective list JSON: expected a data object.");
	}

	const trunkBranch = data.trunk_branch;
	const view = data.view;
	const currentBranch = data.current_branch;
	const filteredToCurrent = data.filtered_to_current;
	const namesOnly = data.names_only;
	const groups = data.groups;
	if (
		typeof trunkBranch !== "string" ||
		typeof view !== "string" ||
		(currentBranch !== null && typeof currentBranch !== "string") ||
		typeof filteredToCurrent !== "boolean" ||
		typeof namesOnly !== "boolean" ||
		!Array.isArray(groups)
	) {
		throw new Error(
			"Invalid objective list JSON: expected trunk_branch, view, current_branch, filtered_to_current, names_only, and groups.",
		);
	}

	return {
		trunkBranch,
		view,
		currentBranch,
		filteredToCurrent,
		namesOnly,
		groups: groups.map(parseObjectiveListGroup),
	};
}

export function parseObjectiveDiffChangedSlugs(stdout: string): string[] {
	const slugs = new Set<string>();
	for (const line of stdout.split(/\r?\n/)) {
		const trimmedLine = line.trimEnd();
		if (!trimmedLine) {
			continue;
		}

		for (const path of changedObjectivePathsFromNameStatusLine(trimmedLine)) {
			const slug = objectiveSlugFromPath(path);
			if (slug) {
				slugs.add(slug);
			}
		}
	}

	return [...slugs].sort((left, right) => left.localeCompare(right));
}

function changedObjectivePathsFromNameStatusLine(line: string): string[] {
	const fields = line.split("\t");
	const status = fields[0] ?? "";
	if (!status) {
		return [];
	}

	if (status.startsWith("R") || status.startsWith("C")) {
		return fields.slice(1).filter(Boolean);
	}

	const path = fields[1];
	return path ? [path] : [];
}

function objectiveSlugFromPath(path: string): string | undefined {
	const parts = path.split("/");
	if (parts.length < 4 || parts[0] !== ".asdl" || parts[1] !== "objectives") {
		return undefined;
	}

	const slug = parts[2];
	return slug ? slug : undefined;
}

function formatCommand(command: string, args: string[]): string {
	return [command, ...args].map(shellQuote).join(" ");
}

function shellQuote(value: string): string {
	if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
		return value;
	}

	return `'${value.replace(/'/g, `'\\''`)}'`;
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

async function listOpenObjectives(
	pi: ExtensionAPI,
	ctx: CommandContext,
	spec: ObjectiveCommandSpec,
): Promise<ObjectiveList> {
	if (ctx.hasUI) {
		ctx.ui.setStatus(spec.statusKey, "listing open Objectives…");
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

async function objectiveDiffSuggestion(
	pi: ExtensionAPI,
	ctx: CommandContext,
	objectiveList: ObjectiveList,
	spec: ObjectiveCommandSpec,
): Promise<ObjectiveDiffSuggestion | undefined> {
	const trunkBranch = objectiveList.trunkBranch.trim();
	if (!trunkBranch) {
		return undefined;
	}

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
			return undefined;
		}

		const changedSlugs = parseObjectiveDiffChangedSlugs(result.stdout);
		if (changedSlugs.length !== 1) {
			return undefined;
		}

		const slug = changedSlugs[0];
		if (!slug || !objectiveList.groups.some((group) => group.slug === slug)) {
			return undefined;
		}

		return { slug, trunkBranch };
	} catch {
		return undefined;
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus(spec.statusKey, undefined);
		}
	}
}

async function expandSkill(
	pi: ExtensionAPI,
	skillName: ObjectiveCommandName,
): Promise<{ name: string; block: string } | undefined> {
	const command = pi
		.getCommands()
		.find((candidate) => candidate.source === "skill" && candidate.name === `skill:${skillName}`);
	if (!command) {
		return undefined;
	}

	const skillPath = command.sourceInfo.path;
	const baseDir = command.sourceInfo.baseDir ?? dirname(skillPath);
	const body = stripFrontmatter(await readFile(skillPath, "utf8"));
	return {
		name: skillName,
		block: `<skill name="${skillName}" location="${skillPath}">\nReferences are relative to ${baseDir}.\n\n${body}\n</skill>`,
	};
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

function latestObjectiveBranch(group: ObjectiveListGroup): ObjectiveBranchEntry | undefined {
	let latest: ObjectiveBranchEntry | undefined;
	for (const branch of group.branches) {
		if (objectiveBranchTimestamp(branch) === undefined) {
			continue;
		}
		if (!latest || compareObjectiveBranchesByLatest(branch, latest) > 0) {
			latest = branch;
		}
	}
	return latest;
}

function objectiveBranchTimestamp(branch: ObjectiveBranchEntry): number | undefined {
	if (branch.tipHeadIso === null) {
		return undefined;
	}

	const timestamp = Date.parse(branch.tipHeadIso);
	return Number.isNaN(timestamp) ? undefined : timestamp;
}

function compareObjectiveBranchesByLatest(left: ObjectiveBranchEntry, right: ObjectiveBranchEntry): number {
	const leftTimestamp = objectiveBranchTimestamp(left) ?? Number.NEGATIVE_INFINITY;
	const rightTimestamp = objectiveBranchTimestamp(right) ?? Number.NEGATIVE_INFINITY;
	if (leftTimestamp !== rightTimestamp) {
		return leftTimestamp - rightTimestamp;
	}

	return right.branch.localeCompare(left.branch);
}

function maxAheadTrunk(group: ObjectiveListGroup): number {
	let maxAhead = 0;
	for (const branch of group.branches) {
		if (branch.aheadTrunk > maxAhead) {
			maxAhead = branch.aheadTrunk;
		}
	}
	return maxAhead;
}

export function formatObjectiveChoice(
	group: ObjectiveListGroup,
	suggestion: ObjectiveDiffSuggestion | undefined = undefined,
): string {
	const branchCount = group.branches.length;
	const branchLabel = branchCount === 1 ? "1 branch" : `${branchCount} branches`;
	const latestBranch = latestObjectiveBranch(group)?.branch ?? "(none)";
	const suggestionLabel = suggestion?.slug === group.slug
		? `suggested: only Objective changed vs ${suggestion.trunkBranch} — `
		: "";
	return `${group.slug} — ${suggestionLabel}${branchLabel} — latest ${latestBranch} — max +${maxAheadTrunk(group)} ahead trunk`;
}

function objectiveGroupsWithSuggestionFirst(
	groups: ObjectiveListGroup[],
	suggestion: ObjectiveDiffSuggestion | undefined,
): ObjectiveListGroup[] {
	if (!suggestion) {
		return groups;
	}

	const suggested = groups.find((group) => group.slug === suggestion.slug);
	if (!suggested) {
		return groups;
	}

	return [suggested, ...groups.filter((group) => group.slug !== suggestion.slug)];
}

async function invokeObjectiveSkill(
	pi: ExtensionAPI,
	ctx: CommandContext,
	spec: ObjectiveCommandSpec,
	objective: string,
): Promise<void> {
	await ctx.waitForIdle();

	const skill = await expandSkill(pi, spec.skillName);
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

async function chooseObjectiveAndInvoke(
	pi: ExtensionAPI,
	ctx: CommandContext,
	spec: ObjectiveCommandSpec,
): Promise<void> {
	await ctx.waitForIdle();

	const objectiveList = await listOpenObjectives(pi, ctx, spec);
	if (objectiveList.groups.length === 0) {
		if (ctx.hasUI) {
			ctx.ui.notify("No open Objectives. Create one with /skill:objective-create.", "info");
		}
		return;
	}

	if (!ctx.hasUI) {
		return;
	}

	const suggestion = await objectiveDiffSuggestion(pi, ctx, objectiveList, spec);
	if (suggestion) {
		ctx.ui.notify(`Suggested ${suggestion.slug} from objective diff vs ${suggestion.trunkBranch}.`, "info");
	}

	const choices = new Map<string, string>();
	for (const group of objectiveGroupsWithSuggestionFirst(objectiveList.groups, suggestion)) {
		choices.set(formatObjectiveChoice(group, suggestion), group.slug);
	}

	const selected = await ctx.ui.select(spec.selectionTitle, [...choices.keys()]);
	if (!selected) {
		ctx.ui.notify("Objective selection cancelled.", "info");
		return;
	}

	const slug = choices.get(selected);
	if (!slug) {
		ctx.ui.notify("Objective selection could not be resolved.", "error");
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
		if (token === "--current" || token === "--names") {
			args.push(token);
			continue;
		}
		if (token === "--view") {
			const value = tokens[index + 1];
			if (!value || value.startsWith("--")) {
				throw new ObjectiveListUsageError("--view requires one of: list, detail.");
			}
			if (!isObjectiveListView(value)) {
				throw new ObjectiveListUsageError(`Unsupported --view value: ${value}. Expected list or detail.`);
			}
			args.push("--view", value);
			index += 1;
			continue;
		}
		if (token.startsWith("--view=")) {
			const value = token.slice("--view=".length);
			if (!isObjectiveListView(value)) {
				throw new ObjectiveListUsageError(`Unsupported --view value: ${value || "(empty)"}. Expected list or detail.`);
			}
			args.push("--view", value);
			continue;
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

function isObjectiveListView(value: string): value is (typeof OBJECTIVE_LIST_VIEW_VALUES)[number] {
	return (OBJECTIVE_LIST_VIEW_VALUES as readonly string[]).includes(value);
}

function objectiveListUsage(error: string): string {
	return `Error: ${error}\n\n${OBJECTIVE_LIST_USAGE}`;
}

export function completeObjectiveListArgs(prefix: string): AutocompleteItem[] | null {
	const tokens = tokenizeArgumentString(prefix);
	const endsWithWhitespace = /\s$/.test(prefix);
	const currentToken = endsWithWhitespace ? "" : (tokens[tokens.length - 1] ?? "");
	const previousToken = endsWithWhitespace ? tokens[tokens.length - 1] : tokens[tokens.length - 2];

	if (currentToken.startsWith("--view=")) {
		const valuePrefix = currentToken.slice("--view=".length);
		return matchingCompletions(
			OBJECTIVE_LIST_VIEW_VALUES.map((value) => `--view=${value}`),
			`--view=${valuePrefix}`,
		);
	}

	const candidates = previousToken === "--view" ? OBJECTIVE_LIST_VIEW_VALUES : OBJECTIVE_LIST_ARG_COMPLETIONS;
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
		description: "List open Objectives in this repository without invoking the agent.",
		getArgumentCompletions: completeObjectiveListArgs,
		handler: async (args, ctx) => handleObjectiveListCommand(pi, args, ctx),
	});

	for (const spec of OBJECTIVE_COMMANDS) {
		pi.registerCommand(spec.commandName, {
			description: spec.description,
			handler: async (args, ctx) => handleObjectiveCommand(pi, spec, args, ctx),
		});
	}
}
