import { runGraphiteCommand } from "@nseng-ai/capability-kit/graphite/branch";
import { formatCommandTermination } from "@nseng-ai/foundation/command";
import {
	commandSucceeded,
	execApiToCommandRunner,
	type ExecResult,
} from "@nseng-ai/foundation/exec";
import { buildFencedTextBlock } from "@nseng-ai/foundation/primitives";
import {
	registerCommandWithImmediateAck,
	sendCommandProgressOrNotify,
} from "@nseng-ai/pi/commands/ack";
import { formatCommandOutput, notifyCommandUi } from "@nseng-ai/pi/commands/helpers";
import { definePiSurfaceParity } from "@nseng-ai/pi/parity/extension";
import type {
	CommandContext,
	CustomMessage,
	MessageRenderer,
} from "@nseng-ai/pi/runtime/extension-types";
import { createPiCommandExecApi, type RawPiExecApi } from "@nseng-ai/pi/shared/command-exec";
import { expandRepoSkillBlock } from "@nseng-ai/pi/skills/expansion";

import {
	createCommandRestackPreflight,
	type RunSmartRestackPreflight,
} from "./restack-preflight.ts";

export const SMART_RESTACK_COMMAND_NAME = "code:gt-restack-resolve";

export const smartRestackParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: SMART_RESTACK_COMMAND_NAME,
		workflow:
			"Run deterministic gt restack before falling through to LM-assisted conflict resolution",
		parity: "WAIVED",
		fallback:
			"Claude Code, Codex, and other non-Pi users should invoke the portable `code-gt-restack-resolve` skill directly; it runs the same Graphite restack workflow from the current repository state.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@internal/pi-tools/code-workflows",
		sourceModule: "smart-restack",
		notes:
			"This Pi-native command is a turn-saving UI wrapper over the portable code-gt-restack-resolve skill; the skill remains the cross-harness workflow contract.",
	},
] as const);

const GT_RESTACK_TIMEOUT_MS = 10 * 60 * 1_000;
const GIT_ABORT_TIMEOUT_MS = 60_000;
const COMMAND_OUTPUT_TAIL_OPTIONS = { maxChars: 4_000, maxLines: 20 } as const;
const RESTACK_RESOLVE_SKILL_NAME = "code-gt-restack-resolve";
const START_RESOLVER_OPTION = "Start LM resolver";
const LEAVE_STOPPED_OPTION = "Leave rebase stopped";
const ABORT_REBASE_OPTION = "Abort rebase";

interface SmartRestackRegisteredCommand {
	description?: string;
	argumentHint?: string;
	handler(args: string, ctx: CommandContext): Promise<void> | void;
}

export interface SmartRestackExtensionAPI extends RawPiExecApi {
	registerCommand(name: string, options: SmartRestackRegisteredCommand): void;
	registerMessageRenderer?(customType: string, renderer: MessageRenderer): void;
	sendMessage?(message: CustomMessage): void;
	sendUserMessage?(content: string): Promise<void> | void;
}

export type LoadRestackSkillBlock = (options: {
	cwd: string;
	skillName: string;
}) => Promise<{ block: string }>;

export interface SmartRestackExtensionOptions {
	runPreflight?: RunSmartRestackPreflight;
	loadSkillBlock?: LoadRestackSkillBlock;
}

type ResolverPromptContext = { type: "interrupted-restack" } | { type: "failed-fast-path" };

interface RunSmartRestackOptions {
	pi: SmartRestackExtensionAPI;
	ctx: CommandContext;
	args: string;
	runPreflight: RunSmartRestackPreflight;
	loadSkillBlock: LoadRestackSkillBlock;
}

interface HandleRestackFailureOptions {
	pi: SmartRestackExtensionAPI;
	ctx: CommandContext;
	args: string;
	restack: ExecResult;
	loadSkillBlock: LoadRestackSkillBlock;
}

interface InvokeLmResolverOptions {
	pi: SmartRestackExtensionAPI;
	ctx: CommandContext;
	args: string;
	promptContext: ResolverPromptContext;
	loadSkillBlock: LoadRestackSkillBlock;
}

export default function smartRestackExtension(
	pi: SmartRestackExtensionAPI,
	options: SmartRestackExtensionOptions = {},
): void {
	const commands = createPiCommandExecApi(pi);
	const runPreflight = options.runPreflight ?? createCommandRestackPreflight({ commands });
	const loadSkillBlock = options.loadSkillBlock ?? expandRepoSkillBlock;

	registerCommandWithImmediateAck({
		host: pi,
		commandName: SMART_RESTACK_COMMAND_NAME,
		commandDefinition: {
			description:
				"Run gt restack first; fall through to LM-assisted conflict resolution if needed",
			argumentHint: "[context for resolver if needed]",
			handler: async (args, ctx) => {
				await ctx.waitForIdle();
				await runSmartRestack({ pi, ctx, args, runPreflight, loadSkillBlock });
			},
		},
		options: { delivery: "message" },
	});
}

export async function runSmartRestack(options: RunSmartRestackOptions): Promise<void> {
	const { pi, ctx, args, runPreflight, loadSkillBlock } = options;
	const preflight = await runPreflight({ cwd: ctx.cwd });
	if (preflight.type === "refused") {
		notifyCommandUi(ctx, preflight.message, "error");
		return;
	}

	if (preflight.type === "rebase-in-progress") {
		sendCommandProgressOrNotify({
			host: pi,
			ctx,
			message:
				"Rebase/restack already in progress; starting LM-driven code-gt-restack-resolve from the current repository state.",
		});
		await invokeLmResolver({
			pi,
			ctx,
			args,
			promptContext: { type: "interrupted-restack" },
			loadSkillBlock,
		});
		return;
	}

	sendCommandProgressOrNotify({
		host: pi,
		ctx,
		message: "Running deterministic fast path: gt restack",
	});
	const restack = await runGraphiteCommand(execApiToCommandRunner(createPiCommandExecApi(pi)), {
		cwd: ctx.cwd,
		args: ["restack"],
		timeoutMs: GT_RESTACK_TIMEOUT_MS,
	});
	if (commandSucceeded(restack)) {
		notifyCommandUi(ctx, formatCleanRestackMessage(restack), "info");
		return;
	}

	await handleRestackFailure({ pi, ctx, args, restack, loadSkillBlock });
}

async function handleRestackFailure(options: HandleRestackFailureOptions): Promise<void> {
	const { pi, ctx, args, restack, loadSkillBlock } = options;
	const failureMessage = formatRestackFailureMessage(restack);
	if (ctx.hasUI === false || ctx.ui.select === undefined) {
		notifyCommandUi(
			ctx,
			`${failureMessage}\n\nNo selection UI is available, so no LM turn was started and no abort was run. Run /code:gt-restack-resolve to resolve from the stopped repository state, leave it for manual handling, or run git rebase --abort to abort.`,
			"warning",
		);
		return;
	}

	const selected = await ctx.ui.select("gt restack needs help", [
		START_RESOLVER_OPTION,
		LEAVE_STOPPED_OPTION,
		ABORT_REBASE_OPTION,
	]);
	switch (selected) {
		case START_RESOLVER_OPTION:
			await invokeLmResolver({
				pi,
				ctx,
				args,
				promptContext: { type: "failed-fast-path" },
				loadSkillBlock,
			});
			return;
		case LEAVE_STOPPED_OPTION:
		case undefined:
			notifyCommandUi(
				ctx,
				`${failureMessage}\n\nRebase left stopped for manual handling.`,
				"warning",
			);
			return;
		case ABORT_REBASE_OPTION:
			await abortRebase(pi, ctx);
			return;
		default:
			notifyCommandUi(
				ctx,
				`${failureMessage}\n\nUnrecognized selection; rebase left stopped for manual handling.`,
				"warning",
			);
	}
}

function formatCleanRestackMessage(result: ExecResult): string {
	return [
		"gt restack completed cleanly. No LM turn was started.",
		formatCommandOutput(result, COMMAND_OUTPUT_TAIL_OPTIONS),
	]
		.filter((part) => part.length > 0)
		.join("\n\n");
}

function formatRestackFailureMessage(result: ExecResult): string {
	return [
		formatFailureHeadline("gt restack", result),
		formatCommandOutput(result, COMMAND_OUTPUT_TAIL_OPTIONS),
	]
		.filter((part) => part.length > 0)
		.join("\n\n");
}

function formatFailureHeadline(command: string, result: ExecResult): string {
	return `${command} ${formatCommandTermination(result)}.`;
}

async function invokeLmResolver(options: InvokeLmResolverOptions): Promise<void> {
	const { pi, ctx, args, promptContext, loadSkillBlock } = options;
	if (pi.sendUserMessage === undefined) {
		notifyCommandUi(
			ctx,
			`Cannot start ${RESTACK_RESOLVE_SKILL_NAME}: this Pi host does not expose sendUserMessage.`,
			"error",
		);
		return;
	}

	let skillBlock: string;
	try {
		skillBlock = (await loadSkillBlock({ cwd: ctx.cwd, skillName: RESTACK_RESOLVE_SKILL_NAME }))
			.block;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		notifyCommandUi(ctx, `Could not read ${RESTACK_RESOLVE_SKILL_NAME}: ${message}`, "error");
		return;
	}

	sendCommandProgressOrNotify({
		host: pi,
		ctx,
		message: `Starting LM-driven ${RESTACK_RESOLVE_SKILL_NAME}.`,
	});
	await pi.sendUserMessage(buildResolverPrompt(skillBlock, args, promptContext));
}

export function buildResolverPrompt(
	skillBlock: string,
	args: string,
	promptContext: ResolverPromptContext,
): string {
	const trimmedArgs = args.trim();
	const contextMessage =
		promptContext.type === "interrupted-restack"
			? `A Graphite restack/rebase is already in progress. Continue from the current repository state and run ${RESTACK_RESOLVE_SKILL_NAME} now. Follow the backing skill workflow exactly.`
			: `A deterministic /code:gt-restack-resolve fast path already ran \`gt restack\` and it did not complete cleanly. Continue from the current repository state and run ${RESTACK_RESOLVE_SKILL_NAME} now. Follow the backing skill workflow exactly.`;
	const base = `${skillBlock}\n\n${contextMessage}`;
	if (trimmedArgs.length === 0) return base;
	return `${base}\n\nAdditional user-supplied context:\n\n${buildFencedTextBlock(trimmedArgs)}`;
}

async function abortRebase(pi: SmartRestackExtensionAPI, ctx: CommandContext): Promise<void> {
	notifyCommandUi(ctx, "Aborting rebase with git rebase --abort.", "warning");
	const abort = await createPiCommandExecApi(pi).exec("git", ["rebase", "--abort"], {
		cwd: ctx.cwd,
		timeout: GIT_ABORT_TIMEOUT_MS,
	});
	if (commandSucceeded(abort)) {
		notifyCommandUi(ctx, "Rebase aborted. No LM turn was started.", "info");
		return;
	}
	notifyCommandUi(
		ctx,
		`${formatFailureHeadline("git rebase --abort", abort)}\n\n${formatCommandOutput(abort, COMMAND_OUTPUT_TAIL_OPTIONS)}`,
		"error",
	);
}
