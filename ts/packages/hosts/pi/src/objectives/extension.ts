import { registerCommandWithImmediateAck } from "../commands/ack.ts";
import {
	CLI_COMMAND_OUTPUT_MESSAGE_TYPE,
	emitCliCommandOutput,
	parseCliCommandArgs,
	renderCliCommandOutputMessage,
	type CliCommandExtensionAPI,
} from "../commands/cli-extension.ts";
import { parseMachineEnvelopeData } from "../runtime/machine-envelope.ts";
import {
	buildObjectiveSkillPrompt,
	chooseActiveObjectiveSlug,
	objectiveSelectionContextFromCommandContext,
} from "./selection.ts";

import { type ExecResult } from "@sdl/core/exec";
import {
	completeObjectiveListArgs,
	createObjectiveClient,
	objectiveCommandSpecs,
	objectiveCompletionItem,
	objectiveCreateCommandSpec,
	parseObjectiveCandidatesData,
	parseObjectiveListArgTokens,
	renderObjectiveListMarkdown,
	type ObjectiveCandidatesParseResult,
	type ObjectiveCommandSpec,
	type ObjectiveCreateCommandSpec,
	type ObjectiveListParsedArgs,
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
} from "../runtime/types.ts";

export type { CommandContext, NotifyLevel, SessionStartContext } from "../runtime/types.ts";
export type { ExecResult } from "@sdl/core/exec";
export {
	completeObjectiveListArgs,
	parseObjectiveListArgTokens,
	parseObjectiveListArgs,
} from "@sdl/objective/api";
export type { ObjectiveListArgsParseResult, ObjectiveListParsedArgs } from "@sdl/objective/api";
export type ObjectiveExtensionAPI = Pick<
	ExtensionAPI,
	"on" | "registerCommand" | "exec" | "getCommands" | "sendMessage" | "sendUserMessage"
> &
	Pick<CliCommandExtensionAPI, "events" | "registerMessageRenderer">;

const OBJECTIVE_LIST_TIMEOUT_MS = 30_000;
const OBJECTIVE_LIST_COMMAND_NAME = "objective:list";
const OBJECTIVE_LIST_ARGUMENT_HINT =
	"[--names] [--minimal] [--status all|active|open|closed] [--help]";
const OBJECTIVE_SELECTOR_ARGUMENT_HINT = "[objective-slug-or-path]";
const OBJECTIVE_CREATE_ARGUMENT_HINT = "[objective-slug-title-or-context]";
const OBJECTIVE_COMPLETION_CACHE_TTL_MS = 10_000;
const ACTIVE_OBJECTIVE_CANDIDATES_ARGS = ["exec", "list-candidates", "--format", "json"] as const;
const OBJECTIVE_STACK_IMPL_COMMAND = {
	commandName: "objective:stack-impl",
	skillName: "objective-stack-impl",
	description:
		"Pick an active Objective, then invoke the portable Objective stack implementation skill for the selected slug.",
	statusKey: "objective:stack-impl",
	selectionTitle: "Select an active Objective for stack implementation",
	shouldCompactDiffSuggestion: true,
	fallbackPrompt:
		"The objective-stack-impl skill was not found among loaded Pi skills. Follow the repository's Objective stack implementation workflow anyway: orchestrate implementation of one explicit Objective as a small Graphite stack from this session. Require user confirmation before execution, run at most one runner subagent at a time, record Objective updates for material progress, and do not submit PRs automatically.",
	actionPrompt: "Run objective-stack-impl for this explicitly selected Objective slug or path:",
} as const;

interface InvokeObjectiveCreateSkillOptions {
	pi: ObjectiveExtensionAPI;
	ctx: CommandContext;
	spec: ObjectiveCreateCommandSpec;
	rawArgs: string;
}

type HandleObjectiveCreateCommandOptions = InvokeObjectiveCreateSkillOptions;

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

function registerObjectiveStackImplementationCommand(pi: ObjectiveExtensionAPI): void {
	registerCommandWithImmediateAck({
		host: pi,
		commandName: OBJECTIVE_STACK_IMPL_COMMAND.commandName,
		commandDefinition: {
			description: OBJECTIVE_STACK_IMPL_COMMAND.description,
			handler: async (args, ctx) => handleObjectiveStackImplCommand(pi, args, ctx),
		},
	});
}

async function handleObjectiveStackImplCommand(
	pi: ObjectiveExtensionAPI,
	args: string,
	ctx: CommandContext,
): Promise<void> {
	const explicitObjective = args.trim();
	try {
		if (explicitObjective) {
			await invokeObjectiveStackImplSkill(pi, ctx, explicitObjective);
			return;
		}

		const slug = await chooseActiveObjectiveSlug(
			pi,
			objectiveSelectionContextFromCommandContext(ctx),
			OBJECTIVE_STACK_IMPL_COMMAND,
		);
		if (!slug) {
			return;
		}

		await invokeObjectiveStackImplSkill(pi, ctx, slug);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (ctx.hasUI) {
			ctx.ui.notify(message, "error");
		}
	}
}

async function invokeObjectiveStackImplSkill(
	pi: ObjectiveExtensionAPI,
	ctx: CommandContext,
	objective: string,
): Promise<void> {
	await invokeRepoSkillPromptTurn({
		host: pi,
		ctx,
		skillName: OBJECTIVE_STACK_IMPL_COMMAND.skillName,
		successMessage: `Invoking ${OBJECTIVE_STACK_IMPL_COMMAND.commandName} for ${objective}.`,
		fallbackMessage: `${OBJECTIVE_STACK_IMPL_COMMAND.skillName} skill was not found; using fallback prompt.`,
		buildPrompt: (skillBlock) =>
			buildObjectiveSkillPrompt({
				spec: OBJECTIVE_STACK_IMPL_COMMAND,
				skillBlock,
				objective,
			}),
	});
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

interface ObjectiveListRequestShape {
	names: boolean;
	minimal: boolean;
	status: "all" | "active" | "open" | "closed";
}

async function handleObjectiveListCommand(
	pi: ObjectiveExtensionAPI,
	rawArgs: string,
	ctx: CommandContext,
): Promise<void> {
	const parsedTokens = parseCliCommandArgs(rawArgs);
	if (!parsedTokens.ok) {
		emitObjectiveListOutput(pi, ctx, rawArgs, [], {
			exitCode: 2,
			stdout: "",
			stderr: `Error: ${parsedTokens.error}\n`,
		});
		return;
	}

	const parsed = parseObjectiveListArgTokens(parsedTokens.args);
	if (parsed.type === "invalid") {
		emitObjectiveListOutput(pi, ctx, rawArgs, parsedTokens.args, {
			exitCode: 2,
			stdout: "",
			stderr: `Error: ${parsed.message}\n`,
		});
		return;
	}

	if (parsed.args.isHelpRequested) {
		emitObjectiveListOutput(pi, ctx, rawArgs, parsed.args.args, {
			exitCode: 0,
			stdout: renderObjectiveListHelp(),
			stderr: "",
		});
		return;
	}

	await ctx.waitForIdle();
	const request = objectiveListRequestFromParsedArgs(parsed.args);
	const listing = await createObjectiveClient({ cwd: ctx.cwd }).listObjectives(request);
	if (!listing.ok) {
		emitObjectiveListOutput(pi, ctx, rawArgs, parsed.args.args, {
			exitCode: 1,
			stdout: "",
			stderr: `Error: ${listing.failure.message}\n`,
		});
		return;
	}

	emitObjectiveListOutput(pi, ctx, rawArgs, parsed.args.args, {
		exitCode: 0,
		stdout: `${renderObjectiveListMarkdown(listing.result)}\n`,
		stderr: "",
	});
}

function objectiveListRequestFromParsedArgs(
	parsed: ObjectiveListParsedArgs,
): ObjectiveListRequestShape {
	const request: ObjectiveListRequestShape = { names: false, minimal: false, status: "active" };
	for (let index = 0; index < parsed.args.length; index += 1) {
		const arg = parsed.args[index];
		if (arg === "--names") {
			request.names = true;
			continue;
		}
		if (arg === "--minimal") {
			request.minimal = true;
			continue;
		}
		if (arg === "--status") {
			request.status = parsed.args[index + 1] as ObjectiveListRequestShape["status"];
			index += 1;
		}
	}
	return request;
}

function renderObjectiveListHelp(): string {
	return `Usage: /objective:list ${OBJECTIVE_LIST_ARGUMENT_HINT}\n\nList checkout-local Objective records without shelling out through the objective CLI.\n\nOptions:\n  --names                         Output Objective slugs only, one per line.\n  --minimal                       Hide local branch attribution.\n  --status all|active|open|closed Filter Objective records by checkout-local status.\n  --help, -h                      Show this help.\n`;
}

function emitObjectiveListOutput(
	pi: ObjectiveExtensionAPI,
	ctx: CommandContext,
	rawArgs: string,
	args: readonly string[],
	result: { exitCode: number; stdout: string; stderr: string },
): void {
	emitCliCommandOutput(pi, ctx, {
		cliName: "objective",
		commandName: "list",
		piCommandName: OBJECTIVE_LIST_COMMAND_NAME,
		rawArgs,
		args: [...args],
		argv: ["list", ...args],
		cwd: ctx.cwd,
		exitCode: result.exitCode,
		stdout: result.stdout,
		stderr: result.stderr,
		level: result.exitCode === 0 ? "info" : "error",
	});
}

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
			"Pi command uses the Objective Capability API in-process and keeps output format controlled by the Objective Pi adapter.",
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
			"Pi registers the skill-backed Objective stack implementation command directly while reusing Objective-owned selection/prompt helpers.",
	},
] as const);

export default function objectiveExtension(pi: ObjectiveExtensionAPI): void {
	const objectiveCommandCompleter = createObjectiveCommandCompleter(pi);

	pi.registerMessageRenderer?.(CLI_COMMAND_OUTPUT_MESSAGE_TYPE, renderCliCommandOutputMessage);
	registerCommandWithImmediateAck({
		host: pi,
		commandName: OBJECTIVE_LIST_COMMAND_NAME,
		commandDefinition: {
			description:
				"objective list: List active Objectives in this repository without invoking the agent.",
			argumentHint: OBJECTIVE_LIST_ARGUMENT_HINT,
			getArgumentCompletions: completeObjectiveListArgs,
			handler: async (args, ctx) => handleObjectiveListCommand(pi, args, ctx),
		},
		options: { delivery: "none" },
	});

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

	registerObjectiveStackImplementationCommand(pi);
}
