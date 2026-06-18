import { definePiSurfaceParity } from "./parity.ts";
import {
	customMessageText,
	truncateDisplayLine,
	type CustomMessageContent,
} from "./terminal-presentation.ts";

const COMMAND_NAME = "sdl:code:push";
const PUSH_TIMEOUT_MS = 2 * 60 * 1000;
export const PUSH_OUTPUT_MESSAGE_TYPE = "sdl-code-push-output";

export const pushParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: COMMAND_NAME,
		workflow: "Push already-committed work from the current branch",
		parity: "PARTIAL",
		trackedGap:
			"cross-harness-parity roadmap: decide whether /sdl:code:push needs a thin skill documenting clean-worktree git push or should be treated as primitive git usage.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "push",
		notes:
			"Pi command exposes the SDL code-lifecycle surface with a clean-worktree guard and message rendering around git push; non-Pi agents can run git status and git push directly, but no installed skill owns the guarded workflow yet.",
	},
] as const);

type NotifyLevel = "info" | "warning" | "error";

export interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
}

export interface CommandContext {
	cwd: string;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
	};
	waitForIdle(): Promise<void>;
}

interface CustomMessage {
	customType: string;
	content: CustomMessageContent;
	display: boolean;
	details?: unknown;
}

interface RenderTheme {
	fg(color: string, text: string): string;
	bold?(text: string): string;
}

interface RenderComponent {
	render(width: number): string[];
	invalidate(): void;
}

type MessageRenderer = (
	message: CustomMessage,
	options: { expanded: boolean },
	theme: RenderTheme,
) => RenderComponent;

export interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult>;
	registerMessageRenderer?(customType: string, renderer: MessageRenderer): void;
	sendMessage?(message: CustomMessage): void;
}

interface PushOutputDetails {
	command: string;
	args: string[];
	cwd: string;
	phase: "argument-rejected" | "status" | "dirty" | "push";
	level: NotifyLevel;
	result?: ExecResult;
}

export default function pushExtension(pi: ExtensionAPI): void {
	pi.registerMessageRenderer?.(PUSH_OUTPUT_MESSAGE_TYPE, renderPushOutputMessage);
	pi.registerCommand(COMMAND_NAME, {
		description: "Push already-committed work on the current branch with git push",
		handler: async (args, ctx) => {
			await runCodePush(pi, ctx, args);
		},
	});
}

export async function runCodePush(
	pi: Pick<ExtensionAPI, "exec" | "sendMessage">,
	ctx: CommandContext,
	args: string,
): Promise<boolean> {
	if (args.trim().length > 0) {
		const content =
			"`/sdl:code:push` does not accept arguments. Run `/sdl:code:push` with no text after the command.";
		emitPushMessage(pi, ctx, {
			content,
			headline: "`/sdl:code:push` does not accept arguments.",
			level: "error",
			details: {
				command: COMMAND_NAME,
				args: [],
				cwd: ctx.cwd,
				phase: "argument-rejected",
				level: "error",
			},
		});
		return false;
	}

	await ctx.waitForIdle();

	const statusResult = await pi.exec("git", ["status", "--porcelain"], { cwd: ctx.cwd });
	if (!pushSucceeded(statusResult)) {
		const content = formatPushEvidence({
			intro: "Could not inspect the worktree status. `/sdl:code:push` did not run `git push`.",
			command: "git status --porcelain",
			cwd: ctx.cwd,
			result: statusResult,
			guidance:
				"Inspect the Git output, fix the repository state, or use `/sdl:submit` for the normal Graphite flow.",
		});
		emitPushMessage(pi, ctx, {
			content,
			headline: "Could not inspect worktree status for `/sdl:code:push`.",
			level: "error",
			details: buildDetails({
				args: ["status", "--porcelain"],
				cwd: ctx.cwd,
				phase: "status",
				level: "error",
				result: statusResult,
			}),
		});
		return false;
	}

	if (statusResult.stdout.trim().length > 0) {
		const content = formatDirtyWorktreeMessage(ctx.cwd, statusResult.stdout);
		emitPushMessage(pi, ctx, {
			content,
			headline: "`/sdl:code:push` requires a clean worktree.",
			level: "warning",
			details: buildDetails({
				args: ["status", "--porcelain"],
				cwd: ctx.cwd,
				phase: "dirty",
				level: "warning",
				result: statusResult,
			}),
		});
		return false;
	}

	const pushResult = await pi.exec("git", ["push"], { cwd: ctx.cwd, timeout: PUSH_TIMEOUT_MS });
	if (pushSucceeded(pushResult)) {
		const content = formatPushEvidence({
			intro: "`git push` completed successfully.",
			command: "git push",
			cwd: ctx.cwd,
			result: pushResult,
		});
		emitPushMessage(pi, ctx, {
			content,
			headline: "`git push` completed successfully.",
			level: "info",
			details: buildDetails({
				args: ["push"],
				cwd: ctx.cwd,
				phase: "push",
				level: "info",
				result: pushResult,
			}),
		});
		return true;
	}

	const content = formatPushEvidence({
		intro:
			"`git push` failed. The branch is likely out of sync or needs the Graphite submit flow. Use `/sdl:submit`.",
		command: "git push",
		cwd: ctx.cwd,
		result: pushResult,
	});
	emitPushMessage(pi, ctx, {
		content,
		headline: "`git push` failed; use `/sdl:submit`.",
		level: "error",
		details: buildDetails({
			args: ["push"],
			cwd: ctx.cwd,
			phase: "push",
			level: "error",
			result: pushResult,
		}),
	});
	return false;
}

export function renderPushOutputMessage(
	message: CustomMessage,
	_options: { expanded: boolean },
	theme: RenderTheme,
): RenderComponent {
	const content = customMessageText(message.content);
	const level = pushMessageLevel(message.details);
	return {
		render(width: number): string[] {
			return content
				.split("\n")
				.map((line, index) =>
					stylePushOutputLine(truncateDisplayLine(line, width), index, level, theme),
				);
		},
		invalidate(): void {},
	};
}

export function pushSucceeded(result: ExecResult): boolean {
	return result.code === 0 && !result.killed;
}

interface FormatPushEvidenceOptions {
	intro: string;
	command: string;
	cwd: string;
	result: ExecResult;
	guidance?: string;
}

export function formatPushEvidence(options: FormatPushEvidenceOptions): string {
	const sections = [
		options.intro,
		`Command: ${options.command}`,
		`Cwd: ${options.cwd}`,
		`Exit: ${options.result.code}`,
		`Killed: ${options.result.killed}`,
	];
	if (options.guidance !== undefined) {
		sections.push(options.guidance);
	}
	sections.push(
		"stdout:",
		formatOutput(options.result.stdout),
		"stderr:",
		formatOutput(options.result.stderr),
	);
	return sections.join("\n");
}

function formatDirtyWorktreeMessage(cwd: string, stdout: string): string {
	return [
		"`/sdl:code:push` requires a clean worktree and did not run `git push`.",
		"Commit or stash outstanding changes first, or use `/sdl:submit` if you want the normal checkpoint/submit flow.",
		`Command: git status --porcelain`,
		`Cwd: ${cwd}`,
		"stdout:",
		formatOutput(stdout),
	].join("\n");
}

interface EmitPushMessageOptions {
	content: string;
	headline: string;
	level: NotifyLevel;
	details: PushOutputDetails;
}

function emitPushMessage(
	pi: Pick<ExtensionAPI, "sendMessage">,
	ctx: CommandContext,
	options: EmitPushMessageOptions,
): void {
	if (pi.sendMessage !== undefined) {
		pi.sendMessage({
			customType: PUSH_OUTPUT_MESSAGE_TYPE,
			content: options.content,
			display: true,
			details: options.details,
		});
		ctx.ui.notify(options.headline, options.level);
		return;
	}

	ctx.ui.notify(options.content, options.level);
}

interface BuildDetailsOptions {
	args: string[];
	cwd: string;
	phase: PushOutputDetails["phase"];
	level: NotifyLevel;
	result?: ExecResult;
}

function buildDetails(options: BuildDetailsOptions): PushOutputDetails {
	const details: PushOutputDetails = {
		command: "git",
		args: [...options.args],
		cwd: options.cwd,
		phase: options.phase,
		level: options.level,
	};
	if (options.result !== undefined) {
		details.result = options.result;
	}
	return details;
}

function formatOutput(output: string): string {
	if (output === "") return "<empty>";
	return output.endsWith("\n") ? output.trimEnd() : output;
}

function stylePushOutputLine(
	line: string,
	index: number,
	level: NotifyLevel,
	theme: RenderTheme,
): string {
	if (line === "") return line;
	if (index === 0 && level === "error") return theme.fg("error", line);
	if (index === 0 && level === "warning") return theme.fg("warning", line);
	if (index === 0) return theme.fg("accent", theme.bold !== undefined ? theme.bold(line) : line);
	if (line === "stdout:" || line === "stderr:") return theme.fg("muted", line);
	return line;
}

function pushMessageLevel(details: unknown): NotifyLevel {
	if (isRecord(details) && details.level === "error") return "error";
	if (isRecord(details) && details.level === "warning") return "warning";
	return "info";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
