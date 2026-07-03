import { registerCommandWithImmediateAck } from "@ji/pi/commands/ack";
import {
	registerCliCommandExtension,
	type CliCommandExtensionAPI,
	type CliCommandInfo,
	type CliCommandRunDeps,
	type ParsedCliCommandArgs,
} from "@ji/pi/commands/cli-extension";
import { parseMachineEnvelopeData } from "@ji/pi/runtime/machine-envelope";
import type { ExecResult } from "@ji/core/command";
import { formatErrorMessage } from "@ji/core/primitives";
import { notifyCommandUi } from "@ji/pi/commands/helpers";
import {
	buildObjectiveSkillPrompt,
	chooseActiveObjectiveSlug,
	completeObjectiveListArgs,
	createObjectiveClient,
	type ObjectiveClient,
	type ObjectiveClientOptions,
	objectiveCommandSpecs,
	objectiveCompletionItem,
	objectiveCreateCommandSpec,
	objectiveSelectionContextFromCommandContext,
	parseObjectiveCandidatesData,
	parseObjectiveListArgTokens,
	renderObjectiveListMarkdown,
	type ObjectiveCandidatesParseResult,
	type ObjectiveCommandSpec,
	type ObjectiveCreateCommandSpec,
	type ObjectiveListParsedArgs,
} from "../api/index.ts";
import { definePiSurfaceParity } from "@ji/pi/parity/extension";
import {
	buildFencedTextBlock,
	expandRepoSkillBlock,
	invokeRepoSkillPromptTurn,
} from "@ji/pi/skills/expansion";
import type {
	AutocompleteItem,
	CommandContext,
	ExecOptions,
	ExtensionAPI,
} from "@ji/pi/runtime/types";

export type { CommandContext, NotifyLevel, SessionStartContext } from "@ji/pi/runtime/types";
export type { ExecResult } from "@ji/core/command";
export {
	completeObjectiveListArgs,
	parseObjectiveListArgTokens,
	parseObjectiveListArgs,
} from "../api/index.ts";
export type { ObjectiveListArgsParseResult, ObjectiveListParsedArgs } from "../api/index.ts";
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
const ACTIVE_OBJECTIVE_CANDIDATES_ARGS = [
	"objective",
	"exec",
	"list-candidates",
	"--format",
	"json",
] as const;
const OBJECTIVE_LIST_COMMAND = {
	name: "list",
	description: "List active Objectives in this repository without invoking the agent.",
	argumentHint: OBJECTIVE_LIST_ARGUMENT_HINT,
	getArgumentCompletions: completeObjectiveListArgs,
	mapParsedArgs: mapObjectiveListParsedArgs,
} satisfies CliCommandInfo;

export interface ObjectiveExtensionOptions {
	createObjectiveClient?: (options: ObjectiveClientOptions) => ObjectiveClient;
}

interface ObjectiveInvocationContext<TSpec = ObjectiveCommandSpec> {
	pi: ObjectiveExtensionAPI;
	ctx: CommandContext;
	spec: TSpec;
}

interface InvokeObjectiveCreateSkillOptions extends ObjectiveInvocationContext<ObjectiveCreateCommandSpec> {
	rawArgs: string;
}

type HandleObjectiveCreateCommandOptions = InvokeObjectiveCreateSkillOptions;

async function invokeObjectiveSkill(
	invocation: ObjectiveInvocationContext,
	objective: string,
): Promise<void> {
	const { pi, ctx, spec } = invocation;
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

async function chooseObjectiveAndInvoke(invocation: ObjectiveInvocationContext): Promise<void> {
	const { pi, ctx, spec } = invocation;
	const slug = await chooseActiveObjectiveSlug(
		pi,
		objectiveSelectionContextFromCommandContext(ctx),
		spec,
	);
	if (!slug) {
		return;
	}

	await invokeObjectiveSkill(invocation, slug);
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
	try {
		await invokeObjectiveCreateSkill(options);
	} catch (error) {
		notifyCommandError(options.ctx, error);
	}
}

async function handleObjectiveCommand(
	invocation: ObjectiveInvocationContext,
	args: string,
): Promise<void> {
	const explicitObjective = args.trim();
	try {
		if (explicitObjective) {
			await invokeObjectiveSkill(invocation, explicitObjective);
			return;
		}

		await chooseObjectiveAndInvoke(invocation);
	} catch (error) {
		notifyCommandError(invocation.ctx, error);
	}
}

function notifyCommandError(ctx: CommandContext, error: unknown): void {
	notifyCommandUi(ctx, formatErrorMessage(error), "error");
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
			"ji",
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

const OBJECTIVE_LIST_STATUS_VALUES = ["all", "active", "open", "closed"] as const;
type ObjectiveListStatus = (typeof OBJECTIVE_LIST_STATUS_VALUES)[number];

interface ObjectiveListRequestShape {
	names: boolean;
	minimal: boolean;
	status: ObjectiveListStatus;
}

function mapObjectiveListParsedArgs(args: readonly string[]): ParsedCliCommandArgs {
	const parsed = parseObjectiveListArgTokens(args);
	if (parsed.type === "invalid") {
		return { ok: false, error: parsed.message };
	}
	if (parsed.args.isHelpRequested) {
		return { ok: true, args: ["--help"] };
	}
	return { ok: true, args: parsed.args.args };
}

async function runObjectiveCliCommand(
	argv: readonly string[],
	deps: CliCommandRunDeps,
	options: ObjectiveExtensionOptions = {},
): Promise<number> {
	const commandName = argv[0];
	if (commandName !== "list") {
		deps.stderr(`Error: unsupported objective command: ${commandName ?? "(missing)"}\n`);
		return 2;
	}

	return await runObjectiveListCommand(argv.slice(1), deps, options);
}

async function runObjectiveListCommand(
	args: readonly string[],
	deps: CliCommandRunDeps,
	options: ObjectiveExtensionOptions = {},
): Promise<number> {
	const parsed = parseObjectiveListArgTokens(args);
	if (parsed.type === "invalid") {
		deps.stderr(`Error: ${parsed.message}\n`);
		return 2;
	}

	if (parsed.args.isHelpRequested) {
		deps.stdout(renderObjectiveListHelp());
		return 0;
	}

	const request = objectiveListRequestFromParsedArgs(parsed.args);
	const objectiveClientFactory = options.createObjectiveClient ?? createObjectiveClient;
	const listing = await objectiveClientFactory({ cwd: deps.cwd }).listObjectives(request);
	if (!listing.ok) {
		deps.stderr(`Error: ${listing.failure.message}\n`);
		return 1;
	}

	deps.stdout(`${renderObjectiveListMarkdown(listing.result)}\n`);
	return 0;
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
			const value = parsed.args[index + 1];
			if (isObjectiveListStatus(value)) {
				request.status = value;
				index += 1;
			}
		}
	}
	return request;
}

function isObjectiveListStatus(value: string | undefined): value is ObjectiveListStatus {
	switch (value) {
		case "all":
		case "active":
		case "open":
		case "closed":
			return true;
		default:
			return false;
	}
}

function renderObjectiveListHelp(): string {
	return `Usage: /objective:list ${OBJECTIVE_LIST_ARGUMENT_HINT}\n\nList checkout-local Objective records without shelling out through the objective CLI.\n\nOptions:\n  --names                         Output Objective slugs only, one per line.\n  --minimal                       Hide local branch attribution.\n  --status all|active|open|closed Filter Objective records by checkout-local status.\n  --help, -h                      Show this help.\n`;
}

export const objectiveParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: OBJECTIVE_LIST_COMMAND_NAME,
		workflow: "List active Objectives in this repository without invoking the agent",
		parity: "FULL",
		cli: "ji objective list",
		skill: "objective",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@ji/objective/pi",
		sourceModule: "objective",
		notes:
			"Pi command uses the Objective Capability API in-process and keeps output format controlled by the Objective Pi adapter.",
	},
	{
		kind: "command",
		surface: objectiveCreateCommandSpec.commandName,
		workflow: objectiveCreateCommandSpec.description,
		parity: "FULL",
		cli: "ji objective exec read-objective plus direct Objective Markdown creation",
		skill: objectiveCreateCommandSpec.skillName,
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@ji/objective/pi",
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
				cli: `ji objective ${spec.cliSubcommand}`,
				skill: spec.skillName,
				ownerObjective: "cross-harness-parity",
				sourcePackage: "@ji/objective/pi",
				sourceModule: "objective",
				notes:
					"Pi command selects an explicit Objective and then expands the matching portable Objective skill.",
			}) as const,
	),
] as const);

export default function objectiveExtension(
	pi: ObjectiveExtensionAPI,
	options: ObjectiveExtensionOptions = {},
): void {
	const objectiveCommandCompleter = createObjectiveCommandCompleter(pi);

	registerCliCommandExtension(pi, {
		cliName: "objective",
		piNamespace: "objective",
		commands: [OBJECTIVE_LIST_COMMAND],
		piCommandAliases: { list: OBJECTIVE_LIST_COMMAND_NAME },
		runCli: async (args, deps) => await runObjectiveCliCommand(args, deps, options),
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
				handler: async (args, ctx) => handleObjectiveCommand({ pi, ctx, spec }, args),
			},
		});
	}
}
