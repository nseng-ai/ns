import type { Clock } from "@nseng-ai/foundation/clock";
import { commandSucceeded, nsCommandSurface } from "@nseng-ai/foundation/command";
import { registerCommandWithImmediateAck } from "@nseng-ai/pi-runtime/commands/ack";
import {
	registerCliCommandExtension,
	type CliCommandExtensionAPI,
	type CliCommandInfo,
	type CliCommandRunDeps,
	type ParsedCliCommandArgs,
} from "@nseng-ai/pi-runtime/commands/cli-extension";
import { parseMachineEnvelopeData } from "@nseng-ai/pi-runtime/runtime/machine-envelope";
import type { CommandExecApi } from "@nseng-ai/foundation/command";
import {
	buildFencedTextBlock,
	formatErrorMessage,
	optionalEntry,
} from "@nseng-ai/foundation/primitives";
import { notifyCommandUi } from "@nseng-ai/pi-runtime/commands/helpers";
import { createPiCommandExecApi } from "@nseng-ai/pi-runtime/shared/command-exec";
import {
	buildObjectiveSkillPrompt,
	chooseActiveObjectiveSlug,
	completeObjectiveListArgs,
	createObjectiveClient,
	isObjectiveListStatus,
	allObjectiveCreateCommandSpecs,
	type ObjectiveClient,
	type ObjectiveClientOptions,
	objectiveCommandSpecs,
	objectiveCompletionItem,
	objectiveCreateCommandSpec,
	objectiveSelectionContextFromCommandContext,
	objectiveSelectionHostFromExec,
	parseObjectiveCandidatesData,
	parseObjectiveListArgTokens,
	renderObjectiveListMarkdown,
	type ObjectiveCandidatesParseResult,
	type ObjectiveCommandSpec,
	type ObjectiveCreateCommandSpec,
	type ObjectiveListParsedArgs,
	type ObjectiveSelectionHost,
	type ObjectiveStatusFilter,
} from "../api/index.ts";
import {
	definePiSurfaceParity,
	type FullPiSurfaceParity,
} from "@nseng-ai/pi-runtime/parity/extension";
import {
	requireRepoSkillBlockFromPath,
	requireRepoSkillPath,
} from "@nseng-ai/pi-runtime/skills/expansion";
import type {
	AutocompleteItem,
	CommandContext,
	RawPiExecOptions,
	ExtensionAPI,
} from "@nseng-ai/pi-runtime/runtime/types";

export type {
	CommandContext,
	NotifyLevel,
	SessionStartContext,
} from "@nseng-ai/pi-runtime/runtime/types";
export type { RawPiExecResult } from "@nseng-ai/pi-runtime/runtime/types";
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
	Pick<CliCommandExtensionAPI, "events" | "registerMessageRenderer"> &
	Pick<Partial<ObjectiveSelectionHost>, "loadObjectiveList">;

const OBJECTIVE_LIST_TIMEOUT_MS = 30_000;
const OBJECTIVE_EXTENSION_ID = "objective";
const OBJECTIVE_LIST_COMMAND_NAME = nsCommandSurface(OBJECTIVE_EXTENSION_ID, "list");
const OBJECTIVE_LIST_ARGUMENT_HINT = "[--names] [--status all|active|open|closed] [--help]";
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
	clock?: Clock;
	createObjectiveClient?: (options: ObjectiveClientOptions) => ObjectiveClient;
}

interface ObjectiveInvocationContext<TSpec = ObjectiveCommandSpec> {
	pi: ObjectiveExtensionAPI;
	selectionHost: ObjectiveSelectionHost;
	ctx: CommandContext;
	spec: TSpec;
}

interface PreparedObjectiveInvocation extends ObjectiveInvocationContext {
	skillPath: string;
}

interface SkillPreparationInvocation {
	ctx: CommandContext;
	spec: { skillName: string };
}

interface InvokeObjectiveCreateSkillOptions extends ObjectiveInvocationContext<ObjectiveCreateCommandSpec> {
	rawArgs: string;
}

type HandleObjectiveCreateCommandOptions = InvokeObjectiveCreateSkillOptions;

async function prepareObjectiveSkill<TInvocation extends SkillPreparationInvocation>(
	invocation: TInvocation,
): Promise<TInvocation & { skillPath: string }> {
	const { ctx, spec } = invocation;
	await ctx.waitForIdle();
	const skillPath = await requireRepoSkillPath({ cwd: ctx.cwd, skillName: spec.skillName });
	return { ...invocation, skillPath };
}

async function invokeObjectiveSkill(
	invocation: PreparedObjectiveInvocation,
	objective: string,
): Promise<void> {
	const { pi, ctx, spec, skillPath } = invocation;
	const skill = await requireRepoSkillBlockFromPath({
		skillName: spec.skillName,
		skillPath,
	});
	if (ctx.hasUI) {
		ctx.ui.notify(`Invoking ${skill.name} for ${objective}.`, "info");
	}
	await pi.sendUserMessage(
		buildObjectiveSkillPrompt({
			spec,
			skillBlock: skill.block,
			objective,
			...optionalEntry("postSelectionReminder", spec.postSelectionReminder),
		}),
	);
}

async function chooseObjectiveAndInvoke(invocation: PreparedObjectiveInvocation): Promise<void> {
	const { selectionHost, ctx, spec } = invocation;
	const slug = await chooseActiveObjectiveSlug(
		selectionHost,
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
	const initialRequest = rawArgs.trim();
	const { skillPath } = await prepareObjectiveSkill(options);
	const skill = await requireRepoSkillBlockFromPath({
		skillName: spec.skillName,
		skillPath,
	});

	if (ctx.hasUI) {
		ctx.ui.notify(
			`Invoking ${spec.skillName}${initialRequest ? " with initial context" : ""}.`,
			"info",
		);
	}

	await pi.sendUserMessage(buildObjectiveCreateSkillPrompt(spec, skill.block, initialRequest));
}

function buildObjectiveCreateSkillPrompt(
	spec: ObjectiveCreateCommandSpec,
	skillBlock: string,
	initialRequest: string,
): string {
	if (initialRequest === "") {
		return `${skillBlock}

No initial Objective creation request was provided. Start the ${spec.skillName} interview by asking the first necessary question before writing files.`;
	}

	return `${skillBlock}

${spec.actionPrompt}

${buildFencedTextBlock(initialRequest)}

Treat this as the user's initial Objective creation request. Use it as context, but still follow ${spec.skillName}'s interview and slug-confirmation workflow before writing files.`;
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
	try {
		const prepared = await prepareObjectiveSkill(invocation);
		const explicitObjective = args.trim();
		if (explicitObjective) {
			await invokeObjectiveSkill(prepared, explicitObjective);
			return;
		}

		await chooseObjectiveAndInvoke(prepared);
	} catch (error) {
		notifyCommandError(invocation.ctx, error);
	}
}

function notifyCommandError(ctx: CommandContext, error: unknown): void {
	notifyCommandUi(ctx, formatErrorMessage(error), "error");
}

function createObjectiveCommandCompleter(
	pi: ObjectiveExtensionAPI,
	commands: CommandExecApi,
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

		const loadPromise = loadObjectiveCompletionItems(commands, cachedCwd).then((items) => {
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
	commands: CommandExecApi,
	cwd: string | undefined,
): Promise<AutocompleteItem[] | null> {
	let result: Awaited<ReturnType<CommandExecApi["exec"]>>;
	try {
		result = await commands.exec(
			"ns",
			[...ACTIVE_OBJECTIVE_CANDIDATES_ARGS],
			objectiveCompletionExecOptions(cwd),
		);
	} catch {
		// Autocomplete is keystroke-triggered; startup failures should quietly remove suggestions.
		return null;
	}

	if (!commandSucceeded(result)) {
		return null;
	}

	const parsed = parseObjectiveCandidates(result.stdout);
	if (parsed.type === "invalid") {
		return null;
	}

	return parsed.records.map(objectiveCompletionItem);
}

function objectiveCompletionExecOptions(cwd: string | undefined): RawPiExecOptions {
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
	status: ObjectiveStatusFilter;
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
	const request: ObjectiveListRequestShape = { names: false, status: "active" };
	for (let index = 0; index < parsed.args.length; index += 1) {
		const arg = parsed.args[index];
		if (arg === "--names") {
			request.names = true;
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

function renderObjectiveListHelp(): string {
	return `Usage: /${OBJECTIVE_LIST_COMMAND_NAME} ${OBJECTIVE_LIST_ARGUMENT_HINT}\n\nList checkout-local Objective records without shelling out through the objective CLI.\n\nOptions:\n  --names                         Output Objective slugs only, one per line.\n  --status all|active|open|closed Filter Objective records by checkout-local status.\n  --help, -h                      Show this help.\n`;
}

function objectiveParityEntry(
	spec: { commandName: string; description: string; skillName: string },
	details: { cli: string; notes: string },
): FullPiSurfaceParity {
	return {
		kind: "command",
		surface: spec.commandName,
		workflow: spec.description,
		parity: "FULL",
		cli: details.cli,
		skill: spec.skillName,
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/objectives/pi",
		sourceModule: "objective",
		notes: details.notes,
	};
}

export const objectiveParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: OBJECTIVE_LIST_COMMAND_NAME,
		workflow: "List active Objectives in this repository without invoking the agent",
		parity: "FULL",
		cli: "ns objective list",
		skill: "objective",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/objectives/pi",
		sourceModule: "objective",
		notes:
			"Pi command uses the Objective Extension API in-process and keeps output format controlled by the Objective Pi adapter.",
	},
	objectiveParityEntry(objectiveCreateCommandSpec, {
		cli: "ns objective exec read-objective plus direct Objective Markdown creation",
		notes:
			"Pi command is a light typeahead-friendly wrapper that expands the portable objective-create skill and preserves any initial user request as context.",
	}),
	...objectiveCommandSpecs.map((spec) =>
		objectiveParityEntry(spec, {
			cli: `ns objective ${spec.cliSubcommand}`,
			notes:
				"Pi command selects an explicit Objective and then expands the matching portable Objective skill.",
		}),
	),
] as const);

export default function objectiveExtension(
	pi: ObjectiveExtensionAPI,
	options: ObjectiveExtensionOptions = {},
): void {
	const commands = createPiCommandExecApi(pi);
	const selectionHost = objectiveSelectionHostFromExec(
		{
			...commands,
			...(pi.loadObjectiveList === undefined
				? {}
				: { loadObjectiveList: pi.loadObjectiveList.bind(pi) }),
		},
		options.clock === undefined ? {} : { clock: options.clock },
	);
	const objectiveCommandCompleter = createObjectiveCommandCompleter(pi, commands);

	registerCliCommandExtension(pi, {
		cliName: "objective",
		piNamespace: "ns:objective",
		commands: [OBJECTIVE_LIST_COMMAND],
		runCli: async (args, deps) => await runObjectiveCliCommand(args, deps, options),
	});

	for (const spec of allObjectiveCreateCommandSpecs) {
		registerCommandWithImmediateAck({
			host: pi,
			commandName: spec.commandName,
			commandDefinition: {
				description: spec.description,
				argumentHint: OBJECTIVE_CREATE_ARGUMENT_HINT,
				handler: async (args, ctx) =>
					handleObjectiveCreateCommand({
						pi,
						selectionHost,
						spec,
						rawArgs: args,
						ctx,
					}),
			},
		});
	}

	for (const spec of objectiveCommandSpecs) {
		registerCommandWithImmediateAck({
			host: pi,
			commandName: spec.commandName,
			commandDefinition: {
				description: spec.description,
				argumentHint: OBJECTIVE_SELECTOR_ARGUMENT_HINT,
				getArgumentCompletions: objectiveCommandCompleter,
				handler: async (args, ctx) =>
					handleObjectiveCommand({ pi, selectionHost, ctx, spec }, args),
			},
		});
	}
}
