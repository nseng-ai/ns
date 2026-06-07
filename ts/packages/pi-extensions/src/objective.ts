import { registerObjectiveStackImplCommand } from "@asdl/ccc/objective-stack-impl";
import {
	chooseActiveObjectiveSlug,
	formatExecFailure,
	formatExecStartupFailure,
	type ObjectiveSelectionSpec,
} from "@asdl/pi-extension-runtime/objective-selection";

import { formatCommand, type ExecResult } from "./command-runtime.ts";
import { expandSkillBlock } from "./skill-expansion.ts";

export type { ExecResult } from "./command-runtime.ts";

const OBJECTIVE_LIST_TIMEOUT_MS = 30_000;
const OBJECTIVE_LIST_COMMAND_NAME = "objective:list";
const OBJECTIVE_LIST_MESSAGE_TYPE = "objective-list-output";

const OBJECTIVE_LIST_USAGE = `Usage: /objective:list [--names] [--status all|active|open|closed] [--help]

Shows \`objective list\` output in chat. Output format is controlled by the Pi extension; --format and --json-schema are not supported.`;

const OBJECTIVE_LIST_ARG_COMPLETIONS = ["--names", "--status", "--help", "-h"] as const;
const OBJECTIVE_LIST_STATUS_VALUES = ["all", "active", "open", "closed"] as const;

export type NotifyLevel = "info" | "warning" | "error";

export interface AutocompleteItem {
	value: string;
	label?: string;
	description?: string;
}

type CustomMessageContent = string | Array<{ type: string; text?: string }>;

interface CustomMessage {
	customType: string;
	content: CustomMessageContent;
	display: boolean;
	details?: unknown;
}

interface CommandInfo {
	name: string;
	source: string;
	sourceInfo: {
		path: string;
		source?: string;
		scope?: string;
		origin?: string;
		baseDir?: string;
	};
}

export interface CommandContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		select(title: string, items: string[]): Promise<string | undefined>;
		setStatus(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
}

export interface ExtensionAPI {
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
}

type ObjectiveCommandName = "objective:next" | "objective:current" | "objective:update";
type ObjectiveSkillName = "objective-next" | "objective-current" | "objective-update";

interface ObjectiveCommandSpec extends ObjectiveSelectionSpec {
	commandName: ObjectiveCommandName;
	skillName: ObjectiveSkillName;
	description: string;
	fallbackPrompt: string;
	actionPrompt: string;
}

export interface ObjectiveListParsedArgs {
	args: string[];
	help: boolean;
}

export type ObjectiveListArgsParseResult =
	| { type: "valid"; args: ObjectiveListParsedArgs }
	| { type: "invalid"; message: string };

interface CustomCliParsedArgs {
	args: string[];
	help: boolean;
}

interface CustomCliArgsParseValid {
	type: "valid";
	args: CustomCliParsedArgs;
}

interface CustomCliArgsParseInvalid {
	type: "invalid";
	message: string;
}

type CustomCliArgsParseResult = CustomCliArgsParseValid | CustomCliArgsParseInvalid;

type ForbiddenObjectiveListArgsParseResult = { type: "valid" } | CustomCliArgsParseInvalid;

interface ObjectiveListStatusParseValid {
	type: "valid";
	value: (typeof OBJECTIVE_LIST_STATUS_VALUES)[number];
}

interface ObjectiveListStatusParseInvalid {
	type: "invalid";
	message: string;
}

type ObjectiveListStatusParseResult = ObjectiveListStatusParseValid | ObjectiveListStatusParseInvalid;

interface CustomCliMessageDetails {
	status: "success" | "failure" | "rejected";
	command: string;
	args: string[];
	cwd: string;
	code?: number;
	killed?: boolean;
	stdoutChars?: number;
	stderrChars?: number;
}

interface CustomCliCommandSpec {
	commandName: string;
	messageType: string;
	timeoutMs: number;
	usage: string;
	parseArgs: (raw: string) => CustomCliArgsParseResult;
	buildArgs: (parsed: CustomCliParsedArgs) => string[];
	completer: (prefix: string) => AutocompleteItem[] | null;
}

const OBJECTIVE_COMMANDS: ObjectiveCommandSpec[] = [
	{
		commandName: "objective:next",
		skillName: "objective-next",
		description:
			"Pick an active Objective, then invoke objective-next to recommend, steer planning, or offer confirmed execution when Objective policy allows it.",
		statusKey: "objective:next",
		selectionTitle: "Select an active Objective for next work or execution preview",
		fallbackPrompt:
			"The objective-next skill was not found among loaded Pi skills. Follow the repository's Objective workflow anyway for the explicit Objective below: apply the Tracking Gate, recommend the next useful work, and only offer execution when the Objective contains explicit Runner Policy / Definition of Progress prose allowing it. If execution is offered, present an upfront preview and wait for explicit confirmation before material action. Do not use hidden ledgers, task files, private queues, Branch Memory run state, or alternate Objective stores. Do not submit PRs or perform external side effects unless included in the confirmed preview scope.",
		actionPrompt: "Run objective-next for this explicitly selected Objective slug or path:",
		compactDiffSuggestion: true,
	},
	{
		commandName: "objective:current",
		skillName: "objective-current",
		description: "Pick an active Objective, then invoke objective-current for the selected slug.",
		statusKey: "objective:current",
		selectionTitle: "Select an active Objective to summarize",
		fallbackPrompt:
			"The objective-current skill was not found among loaded Pi skills. Follow the repository's Objective workflow anyway: summarize the current state of the explicit Objective below without mutating files.",
		actionPrompt: "Run objective-current for this explicitly selected Objective slug or path:",
	},
	{
		commandName: "objective:update",
		skillName: "objective-update",
		description: "Pick an active Objective, then invoke objective-update for the selected slug.",
		statusKey: "objective:update",
		selectionTitle: "Select an active Objective to update",
		fallbackPrompt:
			"The objective-update skill was not found among loaded Pi skills. Follow the repository's Objective workflow anyway: update tracking for exactly one explicit Objective below.",
		actionPrompt: "Run objective-update for this explicitly selected Objective slug or path:",
	},
];

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

function tokenizeArgumentString(args: string): string[] {
	return args.trim().split(/\s+/).filter(Boolean);
}

export function parseObjectiveListArgs(rawArgs: string): ObjectiveListArgsParseResult {
	const tokens = tokenizeArgumentString(rawArgs);
	const forbiddenArgsResult = findForbiddenObjectiveListArg(tokens);
	if (forbiddenArgsResult.type === "invalid") {
		return forbiddenArgsResult;
	}

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
				return { type: "invalid", message: "--status requires one of: all, active, open, closed." };
			}
			const parsedStatus = parseObjectiveListStatus(value);
			if (parsedStatus.type === "invalid") {
				return parsedStatus;
			}
			args.push("--status", parsedStatus.value);
			index += 1;
			continue;
		}
		if (token.startsWith("--status=")) {
			const parsedStatus = parseObjectiveListStatus(token.slice("--status=".length));
			if (parsedStatus.type === "invalid") {
				return parsedStatus;
			}
			args.push("--status", parsedStatus.value);
			continue;
		}
		if (token === "--current" || token.startsWith("--current=")) {
			return {
				type: "invalid",
				message: "--current is no longer supported by the checkout-local Objective list command.",
			};
		}
		if (token === "--view" || token.startsWith("--view=")) {
			return {
				type: "invalid",
				message: "--view is no longer supported by the checkout-local Objective list command.",
			};
		}

		return { type: "invalid", message: `Unsupported /${OBJECTIVE_LIST_COMMAND_NAME} argument: ${token}.` };
	}

	return { type: "valid", args: { args, help } };
}

function findForbiddenObjectiveListArg(tokens: string[]): ForbiddenObjectiveListArgsParseResult {
	for (const token of tokens) {
		if (token === "--format" || token.startsWith("--format=")) {
			return {
				type: "invalid",
				message: "--format is controlled by the Pi extension and is not supported here.",
			};
		}
		if (token === "--json-schema" || token.startsWith("--json-schema=")) {
			return { type: "invalid", message: "--json-schema is not supported by /objective:list." };
		}
	}
	return { type: "valid" };
}

function parseObjectiveListStatus(value: string): ObjectiveListStatusParseResult {
	if ((OBJECTIVE_LIST_STATUS_VALUES as readonly string[]).includes(value)) {
		return { type: "valid", value: value as (typeof OBJECTIVE_LIST_STATUS_VALUES)[number] };
	}

	return {
		type: "invalid",
		message: `Unsupported --status value: ${value || "(empty)"}. Expected all, active, open, or closed.`,
	};
}

function customCliUsage(spec: CustomCliCommandSpec, error: string): string {
	return `Error: ${error}\n\n${spec.usage}`;
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

const OBJECTIVE_LIST_SPEC: CustomCliCommandSpec = {
	commandName: OBJECTIVE_LIST_COMMAND_NAME,
	messageType: OBJECTIVE_LIST_MESSAGE_TYPE,
	timeoutMs: OBJECTIVE_LIST_TIMEOUT_MS,
	usage: OBJECTIVE_LIST_USAGE,
	parseArgs: (raw) => parseObjectiveListArgs(raw),
	buildArgs: (parsed) => (parsed.help ? ["list", "--help"] : ["list", ...parsed.args, "--format", "markdown"]),
	completer: completeObjectiveListArgs,
};

const CUSTOM_CLI_COMMANDS: { spec: CustomCliCommandSpec; description: string }[] = [
	{
		spec: OBJECTIVE_LIST_SPEC,
		description: "List active Objectives in this repository without invoking the agent.",
	},
];

async function handleCustomCliCommand(
	pi: ExtensionAPI,
	spec: CustomCliCommandSpec,
	rawArgs: string,
	ctx: CommandContext,
): Promise<void> {
	await ctx.waitForIdle();

	const parsedArgs = spec.parseArgs(rawArgs);
	if (parsedArgs.type === "invalid") {
		presentCustomCliMessage(
			pi,
			ctx,
			spec,
			customCliUsage(spec, parsedArgs.message),
			{
				status: "rejected",
				command: spec.commandName,
				args: tokenizeArgumentString(rawArgs),
				cwd: ctx.cwd,
			},
			"warning",
		);
		return;
	}

	const commandArgs = spec.buildArgs(parsedArgs.args);
	const commandDisplay = formatCommand("objective", commandArgs);

	if (ctx.hasUI) {
		ctx.ui.setStatus(spec.commandName, `running ${commandDisplay}…`);
	}

	let result: ExecResult;
	try {
		result = await pi.exec("objective", commandArgs, {
			cwd: ctx.cwd,
			timeout: spec.timeoutMs,
		});
	} catch (error) {
		presentCustomCliMessage(
			pi,
			ctx,
			spec,
			formatExecStartupFailure(commandDisplay, error),
			buildCustomCliDetails("failure", commandDisplay, commandArgs, ctx),
			"error",
		);
		return;
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus(spec.commandName, undefined);
		}
	}

	if (result.code !== 0 || result.killed) {
		presentCustomCliMessage(
			pi,
			ctx,
			spec,
			formatExecFailure(commandDisplay, result),
			buildCustomCliDetails("failure", commandDisplay, commandArgs, ctx, result),
			"error",
		);
		return;
	}

	presentCustomCliMessage(
		pi,
		ctx,
		spec,
		objectiveCommandOutputContent(result),
		buildCustomCliDetails("success", commandDisplay, commandArgs, ctx, result),
		"info",
	);
}

function buildCustomCliDetails(
	status: "success" | "failure",
	command: string,
	args: string[],
	ctx: CommandContext,
	result?: ExecResult,
): CustomCliMessageDetails {
	const base: CustomCliMessageDetails = {
		status,
		command,
		args,
		cwd: ctx.cwd,
	};

	if (!result) {
		return base;
	}

	return {
		...base,
		code: result.code,
		killed: result.killed,
		stdoutChars: result.stdout.length,
		stderrChars: result.stderr.length,
	};
}

function objectiveCommandOutputContent(result: ExecResult): string {
	const stdout = result.stdout.trimEnd();
	if (stdout) {
		return stdout;
	}

	const stderr = result.stderr.trimEnd();
	return stderr || "(empty)";
}

function presentCustomCliMessage(
	pi: ExtensionAPI,
	ctx: CommandContext,
	spec: CustomCliCommandSpec,
	content: string,
	details: CustomCliMessageDetails,
	level: NotifyLevel,
): void {
	if (pi.sendMessage) {
		pi.sendMessage({
			customType: spec.messageType,
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
	for (const { spec, description } of CUSTOM_CLI_COMMANDS) {
		pi.registerCommand(spec.commandName, {
			description,
			getArgumentCompletions: spec.completer,
			handler: async (args, ctx) => handleCustomCliCommand(pi, spec, args, ctx),
		});
	}

	for (const spec of OBJECTIVE_COMMANDS) {
		pi.registerCommand(spec.commandName, {
			description: spec.description,
			handler: async (args, ctx) => handleObjectiveCommand(pi, spec, args, ctx),
		});
	}

	registerObjectiveStackImplCommand(pi);
}
