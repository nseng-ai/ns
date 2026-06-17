import { formatOutputSection, tailText, type ExecOptions, type ExecResult } from "@asdl/core/exec";

import { buildFencedTextBlock, expandRepoSkillBlock } from "./skill-expansion.ts";
import { definePiSurfaceParity } from "./parity.ts";

export const SMART_RESTACK_COMMAND_NAME = "gt-smart-restack";

export const smartRestackParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: SMART_RESTACK_COMMAND_NAME,
		workflow: "Deterministically try gt restack before offering LM-assisted conflict resolution",
		parity: "WAIVED",
		fallback: "Run `gt restack`; if it conflicts, run `/code:gt-restack-resolve` or abort the rebase manually.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "smart-restack",
		notes: "This is a Pi-native fast path that intentionally avoids an LM turn unless the user confirms after a failed restack.",
	},
] as const);

const GT_RESTACK_TIMEOUT_MS = 10 * 60 * 1_000;
const GIT_ABORT_TIMEOUT_MS = 60_000;
const COMMAND_OUTPUT_TAIL_OPTIONS = { maxChars: 4_000, maxLines: 20 } as const;
const RESTACK_RESOLVE_SKILL_NAME = "code-gt-restack-resolve";

interface CommandContext {
	cwd: string;
	hasUI?: boolean;
	ui: {
		notify(message: string, level?: "info" | "warning" | "error"): void;
		confirm?(title: string, message: string): Promise<boolean> | boolean;
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

export default function smartRestackExtension(pi: SmartRestackExtensionAPI): void {
	pi.registerCommand(SMART_RESTACK_COMMAND_NAME, {
		description: "Run gt restack first; only offer LM-assisted conflict resolution if it fails",
		argumentHint: "[context for resolver if needed]",
		handler: async (args, ctx) => {
			await ctx.waitForIdle?.();
			await runSmartRestack(pi, ctx, args);
		},
	});
}

export async function runSmartRestack(pi: SmartRestackExtensionAPI, ctx: CommandContext, args: string): Promise<void> {
	notify(ctx, "Running deterministic fast path: gt restack", "info");
	const restack = await pi.exec("gt", ["restack"], { cwd: ctx.cwd, timeout: GT_RESTACK_TIMEOUT_MS });
	if (restack.code === 0) {
		notify(ctx, formatCleanRestackMessage(restack), "info");
		return;
	}

	const failureMessage = formatRestackFailureMessage(restack);
	if (ctx.hasUI !== false && ctx.ui.confirm !== undefined) {
		const shouldInvokeLm = await ctx.ui.confirm(
			"gt restack needs help",
			`${failureMessage}\n\nChoose Yes to start the LM-driven ${RESTACK_RESOLVE_SKILL_NAME} workflow. Choose No to abort the rebase now with git rebase --abort.`,
		);
		if (shouldInvokeLm) {
			await invokeLmResolver(pi, ctx, args);
			return;
		}
		await abortRebase(pi, ctx);
		return;
	}

	notify(
		ctx,
		`${failureMessage}\n\nNo confirmation UI is available, so no LM turn was started and no abort was run. Run /code:gt-restack-resolve to resolve, or git rebase --abort to abort.`,
		"warning",
	);
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

async function invokeLmResolver(pi: SmartRestackExtensionAPI, ctx: CommandContext, args: string): Promise<void> {
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
	await pi.sendUserMessage(buildResolverPrompt(skillBlock, args));
}

function buildResolverPrompt(skillBlock: string, args: string): string {
	const trimmedArgs = args.trim();
	const base = `${skillBlock}\n\nA deterministic gt-smart-restack fast path already ran \`gt restack\` and it did not complete cleanly. Continue from the current repository state and run ${RESTACK_RESOLVE_SKILL_NAME} now. Follow the backing skill workflow exactly.`;
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
