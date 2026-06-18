import { formatOutputSection, tailText, type ExecOptions, type ExecResult } from "@asdl/core/exec";

import { buildFencedTextBlock, expandRepoSkillBlock } from "./skill-expansion.ts";
import { definePiSurfaceParity } from "./parity.ts";

export const SMART_RESTACK_COMMAND_NAME = "code:gt-restack-resolve";

export const smartRestackParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: SMART_RESTACK_COMMAND_NAME,
		workflow: "Run deterministic gt restack before falling through to LM-assisted conflict resolution",
		parity: "WAIVED",
		fallback: "Claude Code, Codex, and other non-Pi users should invoke the portable `code-gt-restack-resolve` skill directly; it runs the same Graphite restack workflow from the current repository state.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "smart-restack",
		notes: "This Pi-native command is a turn-saving UI wrapper over the portable code-gt-restack-resolve skill; the skill remains the cross-harness workflow contract.",
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

interface CommandContext {
	cwd: string;
	hasUI?: boolean;
	ui: {
		notify(message: string, level?: "info" | "warning" | "error"): void;
		select?(title: string, options: string[]): Promise<string | undefined> | string | undefined;
	};
	waitForIdle?(): Promise<void>;
}

interface RegisteredCommand {
	description?: string;
	argumentHint?: string;
	handler(args: string, ctx: CommandContext): Promise<void> | void;
}

export interface SmartRestackExtensionAPI {
	registerCommand(name: string, options: RegisteredCommand): void;
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
	sendUserMessage?(content: string): Promise<void> | void;
}

type ResolverPromptContext =
	| { type: "interrupted-restack" }
	| { type: "failed-fast-path" };

interface HandleRestackFailureOptions {
	pi: SmartRestackExtensionAPI;
	ctx: CommandContext;
	args: string;
	restack: ExecResult;
}

interface InvokeLmResolverOptions {
	pi: SmartRestackExtensionAPI;
	ctx: CommandContext;
	args: string;
	promptContext: ResolverPromptContext;
}

export default function smartRestackExtension(pi: SmartRestackExtensionAPI): void {
	pi.registerCommand(SMART_RESTACK_COMMAND_NAME, {
		description: "Run gt restack first; fall through to LM-assisted conflict resolution if needed",
		argumentHint: "[context for resolver if needed]",
		handler: async (args, ctx) => {
			await ctx.waitForIdle?.();
			await runSmartRestack(pi, ctx, args);
		},
	});
}

export async function runSmartRestack(pi: SmartRestackExtensionAPI, ctx: CommandContext, args: string): Promise<void> {
	const status = await pi.exec("git", ["status"], { cwd: ctx.cwd, timeout: GIT_STATUS_TIMEOUT_MS });
	if (status.code !== 0) {
		notify(ctx, `Cannot inspect repository state with git status; not starting gt restack.\n\n${formatCommandOutput(status)}`, "error");
		return;
	}

	if (isRebaseInProgress(status)) {
		notify(ctx, "Rebase/restack already in progress; starting LM-driven code-gt-restack-resolve from the current repository state.", "info");
		await invokeLmResolver({ pi, ctx, args, promptContext: { type: "interrupted-restack" } });
		return;
	}

	notify(ctx, "Running deterministic fast path: gt restack", "info");
	const restack = await pi.exec("gt", ["restack"], { cwd: ctx.cwd, timeout: GT_RESTACK_TIMEOUT_MS });
	if (restack.code === 0) {
		notify(ctx, formatCleanRestackMessage(restack), "info");
		return;
	}

	await handleRestackFailure({ pi, ctx, args, restack });
}

async function handleRestackFailure(options: HandleRestackFailureOptions): Promise<void> {
	const { pi, ctx, args, restack } = options;
	const failureMessage = formatRestackFailureMessage(restack);
	if (ctx.hasUI === false || ctx.ui.select === undefined) {
		notify(
			ctx,
			`${failureMessage}\n\nNo selection UI is available, so no LM turn was started and no abort was run. Run /code:gt-restack-resolve to resolve from the stopped repository state, leave it for manual handling, or run git rebase --abort to abort.`,
			"warning",
		);
		return;
	}

	const selected = await ctx.ui.select("gt restack needs help", [START_RESOLVER_OPTION, LEAVE_STOPPED_OPTION, ABORT_REBASE_OPTION]);
	switch (selected) {
		case START_RESOLVER_OPTION:
			await invokeLmResolver({ pi, ctx, args, promptContext: { type: "failed-fast-path" } });
			return;
		case LEAVE_STOPPED_OPTION:
		case undefined:
			notify(ctx, `${failureMessage}\n\nRebase left stopped for manual handling.`, "warning");
			return;
		case ABORT_REBASE_OPTION:
			await abortRebase(pi, ctx);
			return;
		default:
			notify(ctx, `${failureMessage}\n\nUnrecognized selection; rebase left stopped for manual handling.`, "warning");
	}
}

function isRebaseInProgress(result: ExecResult): boolean {
	const output = `${result.stdout}\n${result.stderr}`;
	return output.includes("rebase in progress") || output.includes("You are currently rebasing") || output.includes("interactive rebase in progress");
}

function formatCleanRestackMessage(result: ExecResult): string {
	return ["gt restack completed cleanly. No LM turn was started.", formatCommandOutput(result)].filter((part) => part.length > 0).join("\n\n");
}

function formatRestackFailureMessage(result: ExecResult): string {
	return [`gt restack exited with code ${result.code}.`, formatCommandOutput(result)].filter((part) => part.length > 0).join("\n\n");
}

function formatCommandOutput(result: ExecResult): string {
	const parts: string[] = [];
	if (result.stdout.trim().length > 0) parts.push(formatOutputSection("stdout", result.stdout, COMMAND_OUTPUT_TAIL_OPTIONS));
	if (result.stderr.trim().length > 0) parts.push(formatOutputSection("stderr", result.stderr, COMMAND_OUTPUT_TAIL_OPTIONS));
	if (result.startupError !== undefined && result.startupError.length > 0) {
		parts.push(`startup error:\n${tailText(result.startupError.trimEnd(), COMMAND_OUTPUT_TAIL_OPTIONS)}`);
	}
	return parts.join("\n\n");
}

async function invokeLmResolver(options: InvokeLmResolverOptions): Promise<void> {
	const { pi, ctx, args, promptContext } = options;
	if (pi.sendUserMessage === undefined) {
		notify(ctx, `Cannot start ${RESTACK_RESOLVE_SKILL_NAME}: this Pi host does not expose sendUserMessage.`, "error");
		return;
	}

	let skillBlock: string;
	try {
		skillBlock = (await expandRepoSkillBlock({ cwd: ctx.cwd, skillName: RESTACK_RESOLVE_SKILL_NAME })).block;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		notify(ctx, `Could not read ${RESTACK_RESOLVE_SKILL_NAME}: ${message}`, "error");
		return;
	}

	notify(ctx, `Starting LM-driven ${RESTACK_RESOLVE_SKILL_NAME}.`, "info");
	await pi.sendUserMessage(buildResolverPrompt(skillBlock, args, promptContext));
}

function buildResolverPrompt(skillBlock: string, args: string, promptContext: ResolverPromptContext): string {
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
	notify(ctx, "Aborting rebase with git rebase --abort.", "warning");
	const abort = await pi.exec("git", ["rebase", "--abort"], { cwd: ctx.cwd, timeout: GIT_ABORT_TIMEOUT_MS });
	if (abort.code === 0) {
		notify(ctx, "Rebase aborted. No LM turn was started.", "info");
		return;
	}
	notify(ctx, `git rebase --abort exited with code ${abort.code}.\n\n${formatCommandOutput(abort)}`, "error");
}

function notify(ctx: CommandContext, message: string, level: "info" | "warning" | "error"): void {
	if (ctx.hasUI !== false) ctx.ui.notify(message, level);
}
