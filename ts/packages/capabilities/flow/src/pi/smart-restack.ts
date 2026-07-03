import type { ExecResult } from "@ns/core/command";
import {
	combinedGitCommandOutput,
	isGitRebaseInProgressOutput,
} from "../submit/git-operation-output.ts";
import { sendCommandProgressOrNotify, registerCommandWithImmediateAck } from "@ns/pi/commands/ack";

import { formatCommandOutput, notifyCommandUi } from "@ns/pi/commands/helpers";
import { definePiSurfaceParity } from "@ns/pi/parity/extension";
import { buildFencedTextBlock, expandRepoSkillBlock } from "@ns/pi/skills/expansion";

import { type FlowCommandContext, type FlowRegisteredCommand } from "./command-support.ts";
import { type FlowGraphiteCommandHost, runFlowGraphiteCommand } from "./graphite-command.ts";

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
		sourcePackage: "@ns/flow/pi",
		sourceModule: "smart-restack",
		notes:
			"This Pi-native command is a turn-saving UI wrapper over the portable code-gt-restack-resolve skill; the skill remains the cross-harness workflow contract.",
	},
] as const);

const GT_RESTACK_TIMEOUT_MS = 10 * 60 * 1_000;
const GIT_STATUS_TIMEOUT_MS = 60_000;
const GIT_ABORT_TIMEOUT_MS = 60_000;
const COMMAND_OUTPUT_TAIL_OPTIONS = { maxChars: 4_000, maxLines: 20 } as const;
const RESTACK_RESOLVE_SKILL_NAME = "code-gt-restack-resolve";
const START_RESOLVER_OPTION = "Start LM resolver";
const LEAVE_STOPPED_OPTION = "Leave rebase stopped";
const ABORT_REBASE_OPTION = "Abort rebase";

export interface SmartRestackExtensionAPI extends FlowGraphiteCommandHost {
	registerCommand(name: string, options: FlowRegisteredCommand): void;
	sendUserMessage?(content: string): Promise<void> | void;
}

type ResolverPromptContext = { type: "interrupted-restack" } | { type: "failed-fast-path" };

interface HandleRestackFailureOptions {
	pi: SmartRestackExtensionAPI;
	ctx: FlowCommandContext;
	args: string;
	restack: ExecResult;
}

interface InvokeLmResolverOptions {
	pi: SmartRestackExtensionAPI;
	ctx: FlowCommandContext;
	args: string;
	promptContext: ResolverPromptContext;
}

export default function smartRestackExtension(pi: SmartRestackExtensionAPI): void {
	registerCommandWithImmediateAck({
		host: pi,
		commandName: SMART_RESTACK_COMMAND_NAME,
		commandDefinition: {
			description:
				"Run gt restack first; fall through to LM-assisted conflict resolution if needed",
			argumentHint: "[context for resolver if needed]",
			handler: async (args, ctx) => {
				await ctx.waitForIdle?.();
				await runSmartRestack(pi, ctx, args);
			},
		},
	});
}

export async function runSmartRestack(
	pi: SmartRestackExtensionAPI,
	ctx: FlowCommandContext,
	args: string,
): Promise<void> {
	const status = await pi.exec("git", ["status"], { cwd: ctx.cwd, timeout: GIT_STATUS_TIMEOUT_MS });
	if (status.code !== 0) {
		notifyCommandUi(
			ctx,
			`Cannot inspect repository state with git status; not starting gt restack.\n\n${formatCommandOutput(status, COMMAND_OUTPUT_TAIL_OPTIONS)}`,
			"error",
		);
		return;
	}

	if (isRebaseInProgress(status)) {
		sendCommandProgressOrNotify({
			host: pi,
			ctx,
			message:
				"Rebase/restack already in progress; starting LM-driven code-gt-restack-resolve from the current repository state.",
		});
		await invokeLmResolver({ pi, ctx, args, promptContext: { type: "interrupted-restack" } });
		return;
	}

	sendCommandProgressOrNotify({
		host: pi,
		ctx,
		message: "Running deterministic fast path: gt restack",
	});
	const restack = await runFlowGraphiteCommand(pi, {
		cwd: ctx.cwd,
		args: ["restack"],
		timeoutMs: GT_RESTACK_TIMEOUT_MS,
	});
	if (restack.code === 0) {
		notifyCommandUi(ctx, formatCleanRestackMessage(restack), "info");
		return;
	}

	await handleRestackFailure({ pi, ctx, args, restack });
}

async function handleRestackFailure(options: HandleRestackFailureOptions): Promise<void> {
	const { pi, ctx, args, restack } = options;
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
			await invokeLmResolver({ pi, ctx, args, promptContext: { type: "failed-fast-path" } });
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

function isRebaseInProgress(result: ExecResult): boolean {
	return isGitRebaseInProgressOutput(combinedGitCommandOutput(result));
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
		`gt restack exited with code ${result.code}.`,
		formatCommandOutput(result, COMMAND_OUTPUT_TAIL_OPTIONS),
	]
		.filter((part) => part.length > 0)
		.join("\n\n");
}

async function invokeLmResolver(options: InvokeLmResolverOptions): Promise<void> {
	const { pi, ctx, args, promptContext } = options;
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
		skillBlock = (
			await expandRepoSkillBlock({ cwd: ctx.cwd, skillName: RESTACK_RESOLVE_SKILL_NAME })
		).block;
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

function buildResolverPrompt(
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

async function abortRebase(pi: SmartRestackExtensionAPI, ctx: FlowCommandContext): Promise<void> {
	notifyCommandUi(ctx, "Aborting rebase with git rebase --abort.", "warning");
	const abort = await pi.exec("git", ["rebase", "--abort"], {
		cwd: ctx.cwd,
		timeout: GIT_ABORT_TIMEOUT_MS,
	});
	if (abort.code === 0) {
		notifyCommandUi(ctx, "Rebase aborted. No LM turn was started.", "info");
		return;
	}
	notifyCommandUi(
		ctx,
		`git rebase --abort exited with code ${abort.code}.\n\n${formatCommandOutput(abort, COMMAND_OUTPUT_TAIL_OPTIONS)}`,
		"error",
	);
}
