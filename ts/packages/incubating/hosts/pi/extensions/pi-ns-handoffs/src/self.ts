import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import type { ScheduledTimer, TimerScheduler } from "@nseng-ai/foundation/timers";
import { systemTimerScheduler } from "@nseng-ai/foundation/time";
import {
	checkHandoffArtifact,
	createResultSchema,
	type CreateResult,
} from "@nseng-ai/handoffs/api";
import { z } from "zod";

import { createPiCommandExecApi } from "@nseng-ai/pi-runtime/shared/command-exec";
import {
	buildHandoffLaunchPrompt,
	prepareHandoffCreateLaunch,
	type HandoffLaunchPromptCopy,
	type HandoffLaunchRequest,
} from "./launch-flow.ts";
import {
	deriveHandoffInvestigationSources,
	type HandoffInvestigationSourceOptions,
} from "./investigation-sources.ts";
import {
	HANDOFF_SELF_COMMAND_NAME,
	HANDOFF_SELF_STATUS_KEY,
	HANDOFF_SELF_WORKFLOW_TIMEOUT_MS,
} from "./command-constants.ts";
import { createPiHandoffStorageDeps } from "./api-context.ts";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { CommandExecApi } from "@nseng-ai/foundation/command";
import type { HandoffCreateSkillLoader } from "./create-skill.ts";
import { createHandoffStartMessage, setStatus, type HandoffStartMessages } from "./ui-status.ts";
import type { CommandContext, ExtensionAPI, ReplacedSessionContext } from "./runtime-types.ts";

interface HandoffSelfPromptOptions {
	skillBlock: string;
	request: HandoffLaunchRequest;
	investigationSources: HandoffInvestigationSourceOptions;
}

interface HandoffSelfWorkflowOptions {
	git: GitGateway;
	commands?: CommandExecApi;
	timeoutMs?: number;
	skillLoader?: HandoffCreateSkillLoader;
	timers?: TimerScheduler;
}

interface ToolStartEvent {
	toolCallId: string;
	toolName: string;
	args: unknown;
}

interface ToolEndEvent {
	toolCallId: string;
	toolName: string;
	result: unknown;
	isError: boolean;
}

interface HandoffCreateEvidence {
	branch: string;
	slug: string;
	key: string;
	entryLocator: string;
	commit: string;
}

interface ObservingState {
	type: "observing";
	generation: number;
	branch: string;
	cwd: string;
	commands: Map<string, string>;
	results: HandoffCreateEvidence[];
	invalidReason?: string;
	settling: boolean;
	resolve(completion: HandoffSelfCompletion): void;
	timeout: ScheduledTimer;
}

type HandoffSelfWorkflowState =
	| { type: "idle" }
	| { type: "starting"; generation: number }
	| ObservingState
	| { type: "finishing"; generation: number };

type HandoffSelfCompletion =
	| { type: "completed"; evidence: HandoffCreateEvidence }
	| { type: "failed"; message: string }
	| { type: "cancelled" };

type HandoffSelfReplacementResult =
	| { type: "completed" }
	| { type: "cancelled"; message: string }
	| { type: "failed"; message: string };

const createEnvelopeSchema = z.object({
	status: z.literal("ok"),
	exitCode: z.literal(0),
	data: createResultSchema,
});

export const HANDOFF_SELF_PROMPT_COPY = {
	commandName: HANDOFF_SELF_COMMAND_NAME,
	intentSentence:
		"Create a directed handoff artifact for the current session, then let the command replace this session and send a pickup prompt in the fresh session after the saved handoff is verified.",
	abortClause: "do not clear context or pick up the handoff",
	previewHeading:
		"After saving and verification, the command will replace this session and the fresh session will receive this pickup prompt:",
	previewBody(branch: string): string {
		return formatHandoffSelfKickoffPrompt(branch, "<returned-slug>");
	},
} satisfies HandoffLaunchPromptCopy;

const HANDOFF_SELF_START_MESSAGES = {
	ready: `Starting ${HANDOFF_SELF_COMMAND_NAME} workflow with content-derived slug…`,
} satisfies HandoffStartMessages;

export function createHandoffSelfWorkflow(
	pi: ExtensionAPI,
	options: HandoffSelfWorkflowOptions,
): { handleCommand(args: string, ctx: CommandContext): Promise<void> } {
	const commands = options.commands ?? createPiCommandExecApi(pi);
	const timeoutMs = options.timeoutMs ?? HANDOFF_SELF_WORKFLOW_TIMEOUT_MS;
	const timers = options.timers ?? systemTimerScheduler;
	const prepareOptions = {
		git: options.git,
		...(options.skillLoader === undefined ? {} : { skillLoader: options.skillLoader }),
	};
	let generation = 0;
	let state: HandoffSelfWorkflowState = { type: "idle" };

	pi.on?.("tool_execution_start", (rawEvent) => {
		const active = state.type === "observing" && !state.settling ? state : undefined;
		const event = parseToolStartEvent(rawEvent);
		if (active === undefined || event === undefined || event.toolName !== "bash") return;
		const command = readBashCommand(event.args);
		if (command !== undefined) active.commands.set(event.toolCallId, command);
	});

	pi.on?.("tool_execution_end", (rawEvent, ctx) => {
		const active = state.type === "observing" && !state.settling ? state : undefined;
		const event = parseToolEndEvent(rawEvent);
		if (
			active === undefined ||
			event === undefined ||
			ctx === undefined ||
			event.toolName !== "bash"
		)
			return;
		const command = active.commands.get(event.toolCallId);
		active.commands.delete(event.toolCallId);
		const invocation =
			command === undefined ? undefined : parseStandaloneHandoffCreateCommand(command);
		if (invocation === undefined) return;
		if (ctx.cwd !== active.cwd) {
			active.invalidReason = "Handoff create did not complete in the active workflow cwd.";
			return;
		}
		if (invocation.branch !== active.branch) {
			active.invalidReason = `Handoff create targeted branch ${invocation.branch}, not the active workflow branch ${active.branch}.`;
			return;
		}
		if (event.isError) {
			active.invalidReason = "Handoff create did not complete successfully.";
			return;
		}
		const output = readCompleteTextResult(event.result);
		if (output === undefined) {
			active.invalidReason = "Handoff create output was unavailable or truncated.";
			return;
		}
		const parsed = parseCreateEnvelope(output);
		if (parsed === undefined) {
			active.invalidReason = "Handoff create returned malformed structured output.";
			return;
		}
		if (parsed.branch !== active.branch) {
			active.invalidReason = `Handoff create returned branch ${parsed.branch}, not the active workflow branch ${active.branch}.`;
			return;
		}
		active.results.push({
			branch: parsed.branch,
			slug: parsed.slug,
			key: parsed.key,
			entryLocator: parsed.entryLocator,
			commit: parsed.commit,
		});
	});

	pi.on?.("agent_settled", async () => {
		const active = state.type === "observing" ? state : undefined;
		if (active === undefined || active.settling) return;
		if (active.invalidReason !== undefined) {
			complete(active, { type: "failed", message: active.invalidReason });
			return;
		}
		if (active.results.length !== 1) {
			complete(active, {
				type: "failed",
				message:
					active.results.length > 1
						? "Multiple successful Handoff create results were observed; context was not cleared."
						: "No valid Handoff create result was observed; context was not cleared.",
			});
			return;
		}

		const evidence = active.results[0];
		if (evidence === undefined) return;
		active.settling = true;
		try {
			const checked = await checkHandoffArtifact(createPiHandoffStorageDeps(commands, active.cwd), {
				branch: evidence.branch,
				slug: evidence.slug,
			});
			if (state !== active) return;
			if (checked.type === "error") {
				complete(active, {
					type: "failed",
					message: `Handoff verification failed: ${checked.error.message}`,
				});
				return;
			}
			if (
				!checked.value.exists ||
				checked.value.branch !== evidence.branch ||
				checked.value.key !== evidence.key
			) {
				complete(active, {
					type: "failed",
					message: `Created handoff ${evidence.slug} was not found at the exact observed branch and key; context was not cleared.`,
				});
				return;
			}
			complete(active, { type: "completed", evidence });
		} catch (error) {
			if (state !== active) return;
			complete(active, {
				type: "failed",
				message: `Handoff verification failed: ${formatErrorMessage(error)}`,
			});
		}
	});

	pi.on?.("session_shutdown", () => {
		const active = state.type === "observing" ? state : undefined;
		if (active === undefined) {
			state = { type: "idle" };
			return;
		}
		complete(active, { type: "cancelled" });
	});

	function beginObservation(branch: string, cwd: string, workflowGeneration: number) {
		return new Promise<HandoffSelfCompletion>((resolve) => {
			const active: ObservingState = {
				type: "observing",
				generation: workflowGeneration,
				branch,
				cwd,
				commands: new Map(),
				results: [],
				settling: false,
				resolve,
				timeout: timers.setTimeout(() => {
					complete(active, {
						type: "failed",
						message: `${HANDOFF_SELF_COMMAND_NAME} timed out waiting for a successful Handoff create result; context was not cleared.`,
					});
				}, timeoutMs),
			};
			state = active;
		});
	}

	function complete(active: ObservingState, completion: HandoffSelfCompletion): boolean {
		if (state !== active) return false;
		active.timeout.cancel();
		state = { type: "finishing", generation: active.generation };
		active.resolve(completion);
		return true;
	}

	function cancelObservation(workflowGeneration: number): void {
		const active = state.type === "observing" ? state : undefined;
		if (active?.generation === workflowGeneration) {
			complete(active, { type: "cancelled" });
		}
	}

	function isFinishingWorkflow(workflowGeneration: number): boolean {
		return state.type === "finishing" && state.generation === workflowGeneration;
	}

	function finishWorkflow(workflowGeneration: number): void {
		if (state.type === "idle" || state.generation !== workflowGeneration) return;
		if (state.type === "observing") state.timeout.cancel();
		state = { type: "idle" };
	}

	async function handleCommand(args: string, ctx: CommandContext): Promise<void> {
		if (state.type !== "idle") {
			ctx.ui.notify(
				`${HANDOFF_SELF_COMMAND_NAME} is already active in this extension instance; finish or let that workflow time out before starting another.`,
				"warning",
			);
			return;
		}
		if (ctx.newSession === undefined) {
			ctx.ui.notify(
				`/${HANDOFF_SELF_COMMAND_NAME} requires Pi session replacement support.`,
				"error",
			);
			return;
		}

		generation += 1;
		const workflowGeneration = generation;
		state = { type: "starting", generation: workflowGeneration };
		try {
			await ctx.waitForIdle();
			if (state.type !== "starting" || state.generation !== workflowGeneration) return;
			const prepared = await prepareHandoffCreateLaunch(pi, args, ctx, prepareOptions);
			if (prepared === undefined) return;
			if (state.type !== "starting" || state.generation !== workflowGeneration) return;

			const completion = beginObservation(prepared.request.branch, ctx.cwd, workflowGeneration);
			try {
				ctx.ui.notify(createHandoffStartMessage(HANDOFF_SELF_START_MESSAGES), "info");
				pi.sendUserMessage(
					buildHandoffSelfPrompt({
						skillBlock: prepared.skill.block,
						request: prepared.request,
						investigationSources: deriveHandoffInvestigationSources(ctx),
					}),
				);
			} catch (error) {
				cancelObservation(workflowGeneration);
				throw error;
			}

			const result = await completion;
			if (result.type === "cancelled") return;
			if (result.type === "failed") {
				ctx.ui.notify(result.message, "error");
				return;
			}
			if (!isFinishingWorkflow(workflowGeneration)) return;

			await ctx.waitForIdle();
			if (!isFinishingWorkflow(workflowGeneration)) return;
			const replacement = await replaceSessionForSelfHandoff(ctx, ctx.newSession, result.evidence);
			if (replacement.type === "completed") return;
			const recovery = formatHandoffSelfManualRecovery(
				result.evidence.branch,
				result.evidence.slug,
			);
			if (replacement.type === "cancelled") {
				ctx.ui.notify(
					`${HANDOFF_SELF_COMMAND_NAME} created and verified handoff ${result.evidence.slug} on branch ${result.evidence.branch}, but ${replacement.message} Context was not cleared. ${recovery}`,
					"warning",
				);
				return;
			}
			ctx.ui.notify(
				`${HANDOFF_SELF_COMMAND_NAME} created and verified handoff ${result.evidence.slug} on branch ${result.evidence.branch}, but Pi session replacement failed. Context was not cleared. ${replacement.message} ${recovery}`,
				"error",
			);
		} finally {
			finishWorkflow(workflowGeneration);
		}
	}

	return { handleCommand };
}

export function buildHandoffSelfPrompt(options: HandoffSelfPromptOptions): string {
	return buildHandoffLaunchPrompt(HANDOFF_SELF_PROMPT_COPY, {
		skillBlock: options.skillBlock,
		request: options.request,
		investigationSources: options.investigationSources,
		createCommandInstruction: `Write the exact final Markdown content to a temporary file using Pi's built-in write tool, then run \`ns handoff create --branch ${options.request.branch} --file <temporary-path> --format json\` as a standalone Bash command. Do not pass --slug unless the user explicitly supplied an override.`,
		toolCallInstruction:
			"After the standalone `ns handoff create` command succeeds, stop. The command observes and verifies its exact structured result after the agent settles.",
		extraRequirements: [
			"Run `ns handoff create` as a standalone Bash command with `--format json`; do not chain another command or redirect its structured output.",
			`Do not queue slash commands such as /${HANDOFF_SELF_COMMAND_NAME}-resume, /${HANDOFF_SELF_COMMAND_NAME}-pickup, or /new as user messages. The command owns session replacement after observing the create result.`,
		],
	});
}

export function formatHandoffSelfKickoffPrompt(branch: string, slug: string): string {
	return `Pick up handoff ${slug} on branch ${branch}. Summarize it and wait for my direction before continuing.`;
}

function formatHandoffSelfManualRecovery(branch: string, slug: string): string {
	return `Start a fresh session manually and pick it up with: ${formatHandoffSelfKickoffPrompt(branch, slug)}`;
}

async function replaceSessionForSelfHandoff(
	ctx: CommandContext,
	newSession: NonNullable<CommandContext["newSession"]>,
	completion: { branch: string; slug: string },
): Promise<HandoffSelfReplacementResult> {
	const kickoffPrompt = formatHandoffSelfKickoffPrompt(completion.branch, completion.slug);
	const parentSession = ctx.sessionManager.getSessionFile?.();
	const withSession = async (replacementCtx: ReplacedSessionContext): Promise<void> => {
		replacementCtx.ui.notify(
			`Picking up handoff ${completion.slug} from branch ${completion.branch}…`,
			"info",
		);
		try {
			await replacementCtx.sendUserMessage(kickoffPrompt);
		} catch (error) {
			replacementCtx.ui.notify(
				`The fresh session could not send its Handoff pickup prompt: ${formatErrorMessage(error)} ${formatHandoffSelfManualRecovery(completion.branch, completion.slug)}`,
				"error",
			);
		}
	};

	let shouldClearStatus = true;
	setStatus(ctx, HANDOFF_SELF_STATUS_KEY, "clearing context…");
	try {
		const replacement = await newSession(
			parentSession === undefined ? { withSession } : { parentSession, withSession },
		);
		if (replacement.cancelled) {
			return { type: "cancelled", message: "Pi session replacement was cancelled." };
		}
		shouldClearStatus = false;
		return { type: "completed" };
	} catch (error: unknown) {
		return { type: "failed", message: formatErrorMessage(error) };
	} finally {
		if (shouldClearStatus) setStatus(ctx, HANDOFF_SELF_STATUS_KEY, undefined);
	}
}

function parseToolStartEvent(value: unknown): ToolStartEvent | undefined {
	const result = z
		.object({ toolCallId: z.string(), toolName: z.string(), args: z.unknown() })
		.safeParse(value);
	return result.success ? result.data : undefined;
}

function parseToolEndEvent(value: unknown): ToolEndEvent | undefined {
	const result = z
		.object({
			toolCallId: z.string(),
			toolName: z.string(),
			result: z.unknown(),
			isError: z.boolean(),
		})
		.safeParse(value);
	return result.success ? result.data : undefined;
}

function readBashCommand(args: unknown): string | undefined {
	const result = z.object({ command: z.string() }).safeParse(args);
	return result.success ? result.data.command.trim() : undefined;
}

function parseStandaloneHandoffCreateCommand(command: string): { branch: string } | undefined {
	const argv = tokenizeStandaloneCommand(command);
	if (argv === undefined || argv.length < 7) return undefined;
	if (argv[0] !== "ns" || argv[1] !== "handoff" || argv[2] !== "create") return undefined;
	const options = new Map<string, string>();
	for (let index = 3; index < argv.length; index += 2) {
		const name = argv[index];
		const value = argv[index + 1];
		if (
			name === undefined ||
			value === undefined ||
			!(name === "--branch" || name === "--file" || name === "--slug" || name === "--format") ||
			options.has(name)
		) {
			return undefined;
		}
		options.set(name, value);
	}
	const branch = options.get("--branch");
	if (
		branch === undefined ||
		options.get("--format") !== "json" ||
		options.get("--file") === undefined
	) {
		return undefined;
	}
	return { branch };
}

function tokenizeStandaloneCommand(command: string): string[] | undefined {
	const tokens: string[] = [];
	let token = "";
	let quote: "'" | '"' | undefined;
	let tokenStarted = false;
	for (const character of command.trim()) {
		if (quote !== undefined) {
			if (character === quote) quote = undefined;
			else token += character;
			tokenStarted = true;
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			tokenStarted = true;
			continue;
		}
		if (/\s/u.test(character)) {
			if (tokenStarted) {
				tokens.push(token);
				token = "";
				tokenStarted = false;
			}
			continue;
		}
		if (";&|<>\\`$()".includes(character)) return undefined;
		token += character;
		tokenStarted = true;
	}
	if (quote !== undefined) return undefined;
	if (tokenStarted) tokens.push(token);
	return tokens;
}

function readCompleteTextResult(result: unknown): string | undefined {
	const parsed = z
		.object({
			content: z.array(z.object({ type: z.literal("text"), text: z.string() })),
			details: z
				.object({ truncation: z.object({ truncated: z.boolean() }).optional() })
				.optional()
				.nullable(),
		})
		.safeParse(result);
	if (!parsed.success || parsed.data.details?.truncation?.truncated === true) return undefined;
	return parsed.data.content.map((item) => item.text).join("\n");
}

function parseCreateEnvelope(output: string): CreateResult | undefined {
	try {
		const result = createEnvelopeSchema.safeParse(JSON.parse(output));
		return result.success ? result.data.data : undefined;
	} catch {
		return undefined;
	}
}
