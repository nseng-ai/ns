import { registerObjectiveStackImplCommand } from "@sdl/ccc/objective-stack-impl";
import { registerCommandWithImmediateAck } from "../commands/ack.ts";
import { parseMachineEnvelopeData } from "../runtime/machine-envelope.ts";
import {
	buildObjectiveSkillPrompt,
	chooseActiveObjectiveSlug,
	objectiveSelectionContextFromCommandContext,
	withObjectiveCliSelectionHost,
} from "./selection.ts";

import {
	formatCommand,
	formatCommandFailure,
	formatCommandStartupFailure,
	type ExecResult,
} from "@sdl/core/exec";
import {
	completeObjectiveListArgs,
	objectiveCommandSpecs,
	objectiveCompletionItem,
	objectiveCreateCommandSpec,
	parseObjectiveCandidatesData,
	parseObjectiveListArgs,
	type ObjectiveCandidatesParseResult,
	type ObjectiveCommandSpec,
	type ObjectiveCreateCommandSpec,
} from "@sdl/objective/api";
import { definePiSurfaceParity } from "../parity/extension.ts";
import {
	buildFencedTextBlock,
	expandRepoSkillBlock,
	invokeRepoSkillPromptTurn,
} from "../skills/expansion.ts";
import type {
	AutocompleteItem,
	CommandContext,
	ExecOptions,
	ExtensionAPI,
	NotifyLevel,
} from "../cmux/types.ts";

export type { CommandContext, NotifyLevel, SessionStartContext } from "../cmux/types.ts";
export type { ExecResult } from "@sdl/core/exec";
export { completeObjectiveListArgs, parseObjectiveListArgs } from "@sdl/objective/api";
export type { ObjectiveListArgsParseResult, ObjectiveListParsedArgs } from "@sdl/objective/api";
export type ObjectiveExtensionAPI = Pick<
	ExtensionAPI,
	"on" | "registerCommand" | "exec" | "getCommands" | "sendMessage" | "sendUserMessage"
>;

const OBJECTIVE_LIST_TIMEOUT_MS = 30_000;
const OBJECTIVE_LIST_COMMAND_NAME = "objective:list";
const OBJECTIVE_LIST_MESSAGE_TYPE = "objective-list-output";
const OBJECTIVE_SELECTOR_ARGUMENT_HINT = "[objective-slug-or-path]";
const OBJECTIVE_CREATE_ARGUMENT_HINT = "[objective-slug-title-or-context]";
const OBJECTIVE_COMPLETION_CACHE_TTL_MS = 10_000;
const ACTIVE_OBJECTIVE_CANDIDATES_ARGS = ["exec", "list-candidates", "--format", "json"] as const;

const OBJECTIVE_LIST_USAGE = `Usage: /objective:list [--names] [--minimal] [--status all|active|open|closed] [--help]

Shows \`objective list\` output in chat. Output format is controlled by the Pi extension; --format and --json-schema are not supported.`;

interface InvokeObjectiveCreateSkillOptions {
	pi: ObjectiveExtensionAPI;
	ctx: CommandContext;
	spec: ObjectiveCreateCommandSpec;
	rawArgs: string;
}

type HandleObjectiveCreateCommandOptions = InvokeObjectiveCreateSkillOptions;

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

async function invokeObjectiveSkill(
	pi: ObjectiveExtensionAPI,
	ctx: CommandContext,
	spec: ObjectiveCommandSpec,
	objective: string,
): Promise<void> {
	await invokeRepoSkillPromptTurn({
		host: pi,
		ctx,
		skillName: spec.skillName,
		successMessage: (skill) => `Invoking ${skill.name} for ${objective}.`,
		fallbackMessage: `${spec.skillName} skill was not found; using fallback prompt.`,
		buildPrompt: (skillBlock) =>
			buildObjectiveSkillPrompt({
				spec,
				skillBlock,
				objective,
				...(spec.postSelectionReminder === undefined
					? {}
					: { postSelectionReminder: spec.postSelectionReminder }),
			}),
	});
}

async function chooseObjectiveAndInvoke(
	pi: ObjectiveExtensionAPI,
	ctx: CommandContext,
	spec: ObjectiveCommandSpec,
): Promise<void> {
	const slug = await chooseActiveObjectiveSlug(
		pi,
		objectiveSelectionContextFromCommandContext(ctx),
		spec,
	);
	if (!slug) {
		return;
	}

	await invokeObjectiveSkill(pi, ctx, spec, slug);
}

async function invokeObjectiveCreateSkill(
	options: InvokeObjectiveCreateSkillOptions,
): Promise<void> {
	const { pi, ctx, spec, rawArgs } = options;
	await ctx.waitForIdle();
	const initialRequest = rawArgs.trim();
	let skillBlock: string;
	try {
		skillBlock = (await expandRepoSkillBlock({ cwd: ctx.cwd, skillName: spec.skillName })).block;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to read ${spec.skillName} backing skill: ${message}`);
	}

	if (ctx.hasUI) {
		ctx.ui.notify(
			`Invoking ${spec.skillName}${initialRequest ? " with initial context" : ""}.`,
			"info",
		);
	}

	await pi.sendUserMessage(buildObjectiveCreateSkillPrompt(spec, skillBlock, initialRequest));
}

function buildObjectiveCreateSkillPrompt(
	spec: ObjectiveCreateCommandSpec,
	skillBlock: string,
	initialRequest: string,
): string {
	if (initialRequest === "") {
		return `${skillBlock}

No initial Objective creation request was provided. Start the objective-create interview by asking the first necessary question before writing files.`;
	}

	return `${skillBlock}

${spec.actionPrompt}

${buildFencedTextBlock(initialRequest)}

Treat this as the user's initial Objective creation request. Use it as context, but still follow objective-create's interview and slug-confirmation workflow before writing files.`;
}

async function handleObjectiveCreateCommand(
	options: HandleObjectiveCreateCommandOptions,
): Promise<void> {
	const { ctx } = options;
	try {
		await invokeObjectiveCreateSkill(options);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (ctx.hasUI) {
			ctx.ui.notify(message, "error");
		}
	}
}

async function handleObjectiveCommand(
	pi: ObjectiveExtensionAPI,
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

function customCliUsage(spec: CustomCliCommandSpec, error: string): string {
	return `Error: ${error}\n\n${spec.usage}`;
}

function createObjectiveCommandCompleter(
	pi: ObjectiveExtensionAPI,
): (prefix: string) => Promise<AutocompleteItem[] | null> {
	let cachedCwd: string | undefined;
	let cachedItems: AutocompleteItem[] | null | undefined;
	let cacheLoadedAtMs = 0;
	let inFlightLoad: Promise<AutocompleteItem[] | null> | undefined;

	pi.on("session_start", (_event, ctx) => {
		cachedCwd = ctx.cwd;
		cachedItems = undefined;
		cacheLoadedAtMs = 0;
		inFlightLoad = undefined;
	});

	async function getObjectiveCompletionItems(): Promise<AutocompleteItem[] | null> {
		const now = Date.now();
		if (cachedItems !== undefined && now - cacheLoadedAtMs <= OBJECTIVE_COMPLETION_CACHE_TTL_MS) {
			return cachedItems;
		}

		if (inFlightLoad !== undefined) {
			return inFlightLoad;
		}

		const loadPromise = loadObjectiveCompletionItems(pi, cachedCwd).then((items) => {
			cachedItems = items;
			cacheLoadedAtMs = Date.now();
			return items;
		});
		inFlightLoad = loadPromise.finally(() => {
			inFlightLoad = undefined;
		});
		return inFlightLoad;
	}

	return async (prefix) => {
		const query = prefix.trim();
		if (/\s/.test(query)) {
			return null;
		}

		const items = await getObjectiveCompletionItems();
		if (items === null) {
			return null;
		}

		const filtered = items.filter((item) => item.value.startsWith(query));
		return filtered.length > 0 ? filtered : null;
	};
}

async function loadObjectiveCompletionItems(
	pi: ObjectiveExtensionAPI,
	cwd: string | undefined,
): Promise<AutocompleteItem[] | null> {
	let result: ExecResult;
	try {
		result = await pi.exec(
			"objective",
			[...ACTIVE_OBJECTIVE_CANDIDATES_ARGS],
			objectiveCompletionExecOptions(cwd),
		);
	} catch {
		// Autocomplete is keystroke-triggered; startup failures should quietly remove suggestions.
		return null;
	}

	if (result.code !== 0 || result.killed) {
		return null;
	}

	const parsed = parseObjectiveCandidates(result.stdout);
	if (parsed.type === "invalid") {
		return null;
	}

	return parsed.records.map(objectiveCompletionItem);
}

function objectiveCompletionExecOptions(cwd: string | undefined): ExecOptions {
	if (cwd === undefined) {
		return { timeout: OBJECTIVE_LIST_TIMEOUT_MS };
	}
	return { cwd, timeout: OBJECTIVE_LIST_TIMEOUT_MS };
}

function parseObjectiveCandidates(stdout: string): ObjectiveCandidatesParseResult {
	const envelope = parseMachineEnvelopeData(stdout, { label: "objective candidates JSON" });
	if (envelope.type !== "valid") {
		return { type: "invalid", message: envelope.message };
	}

	return parseObjectiveCandidatesData(envelope.data);
}

const OBJECTIVE_LIST_SPEC: CustomCliCommandSpec = {
	commandName: OBJECTIVE_LIST_COMMAND_NAME,
	messageType: OBJECTIVE_LIST_MESSAGE_TYPE,
	timeoutMs: OBJECTIVE_LIST_TIMEOUT_MS,
	usage: OBJECTIVE_LIST_USAGE,
	parseArgs: (raw) => parseObjectiveListArgs(raw),
	buildArgs: (parsed) =>
		parsed.help ? ["list", "--help"] : ["list", ...parsed.args, "--format", "markdown"],
	completer: completeObjectiveListArgs,
};

const CUSTOM_CLI_COMMANDS: { spec: CustomCliCommandSpec; description: string }[] = [
	{
		spec: OBJECTIVE_LIST_SPEC,
		description: "List active Objectives in this repository without invoking the agent.",
	},
];

export const objectiveParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: OBJECTIVE_LIST_COMMAND_NAME,
		workflow: "List active Objectives in this repository without invoking the agent",
		parity: "FULL",
		cli: "objective list",
		skill: "objective",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi",
		sourceModule: "objective",
		notes:
			"Pi command formats objective list output in chat while delegating inventory to the Objective CLI.",
	},
	{
		kind: "command",
		surface: objectiveCreateCommandSpec.commandName,
		workflow: objectiveCreateCommandSpec.description,
		parity: "FULL",
		cli: "objective exec read-objective plus direct Objective Markdown creation",
		skill: objectiveCreateCommandSpec.skillName,
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi",
		sourceModule: "objective",
		notes:
			"Pi command is a light typeahead-friendly wrapper that expands the portable objective-create skill and preserves any initial user request as context.",
	},
	...objectiveCommandSpecs.map(
		(spec) =>
			({
				kind: "command",
				surface: spec.commandName,
				workflow: spec.description,
				parity: "FULL",
				cli: `objective ${spec.commandName.slice("objective:".length)}`,
				skill: spec.skillName,
				ownerObjective: "cross-harness-parity",
				sourcePackage: "@sdl/pi",
				sourceModule: "objective",
				notes:
					"Pi command selects an explicit Objective and then expands the matching portable Objective skill.",
			}) as const,
	),
	{
		kind: "command",
		surface: "objective:stack-impl",
		workflow:
			"Pick an active Objective, then invoke the portable Objective stack implementation skill",
		parity: "FULL",
		cli: "objective list-candidates plus explicit objective-stack-impl skill invocation",
		skill: "objective-stack-impl",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi",
		sourceModule: "objective",
		notes:
			"The public command is registered through @sdl/ccc, but exposed by the @sdl/pi Objective adapter.",
	},
] as const);

async function handleCustomCliCommand(
	pi: ObjectiveExtensionAPI,
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
		ctx.ui.setStatus?.(spec.commandName, `running ${commandDisplay}…`);
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
			formatCommandStartupFailure("objective command failed", commandDisplay, error),
			buildCustomCliDetails("failure", commandDisplay, commandArgs, ctx),
			"error",
		);
		return;
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus?.(spec.commandName, undefined);
		}
	}

	if (result.code !== 0 || result.killed) {
		presentCustomCliMessage(
			pi,
			ctx,
			spec,
			formatCommandFailure("objective command failed", commandDisplay, result),
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
	pi: ObjectiveExtensionAPI,
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

export default function objectiveExtension(pi: ObjectiveExtensionAPI): void {
	const objectiveCommandCompleter = createObjectiveCommandCompleter(pi);

	for (const { spec, description } of CUSTOM_CLI_COMMANDS) {
		registerCommandWithImmediateAck({
			host: pi,
			commandName: spec.commandName,
			commandDefinition: {
				description,
				getArgumentCompletions: spec.completer,
				handler: async (args, ctx) => handleCustomCliCommand(pi, spec, args, ctx),
			},
		});
	}

	registerCommandWithImmediateAck({
		host: pi,
		commandName: objectiveCreateCommandSpec.commandName,
		commandDefinition: {
			description: objectiveCreateCommandSpec.description,
			argumentHint: OBJECTIVE_CREATE_ARGUMENT_HINT,
			handler: async (args, ctx) =>
				handleObjectiveCreateCommand({
					pi,
					spec: objectiveCreateCommandSpec,
					rawArgs: args,
					ctx,
				}),
		},
	});

	for (const spec of objectiveCommandSpecs) {
		registerCommandWithImmediateAck({
			host: pi,
			commandName: spec.commandName,
			commandDefinition: {
				description: spec.description,
				argumentHint: OBJECTIVE_SELECTOR_ARGUMENT_HINT,
				getArgumentCompletions: objectiveCommandCompleter,
				handler: async (args, ctx) => handleObjectiveCommand(pi, spec, args, ctx),
			},
		});
	}

	registerObjectiveStackImplCommand(withObjectiveCliSelectionHost(pi));
}
