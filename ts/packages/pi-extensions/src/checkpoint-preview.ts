import { formatCommand, type ExecResult } from "./command-runtime.ts";

export const CHECKPOINT_PREVIEW_COMMAND_NAME = "cp-preview";
export const CHECKPOINT_PREVIEW_ALIAS_COMMAND_NAME = "checkpoint-preview";

const STATUS_KEY = CHECKPOINT_PREVIEW_COMMAND_NAME;
const MESSAGE_TYPE = "checkpoint-preview-output";
const GIT_TIMEOUT_MS = 30_000;
const MAX_DIFF_CHARS = 48_000;
const MAX_STATUS_CHARS = 12_000;

const USAGE = `Usage: /${CHECKPOINT_PREVIEW_COMMAND_NAME}

Generates a dev-checkpoint-style commit message preview for current changes without staging or committing anything.`;

export type NotifyLevel = "info" | "warning" | "error";

export interface CustomMessage {
	customType: string;
	content: string;
	display: boolean;
	details?: unknown;
}

export interface CommandContext {
	cwd: string;
	hasUI?: boolean;
	ui?: {
		notify?(message: string, level?: NotifyLevel): void;
		setStatus?(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
}

export interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult>;
	sendMessage?(message: CustomMessage, options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" }): void;
	sendUserMessage(content: string): void;
}

export interface CheckpointPreviewPromptInput {
	branch: string;
	statusPorcelain: string;
	diffHead: string;
	untrackedFiles: string[];
}

export interface CheckpointPreviewDetails {
	status: "prompt-sent" | "rejected" | "failure" | "usage";
	command: string;
	cwd: string;
	branch?: string;
	reason?: string;
}

class CheckpointPreviewUsageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CheckpointPreviewUsageError";
	}
}

export function buildCheckpointPreviewPrompt(input: CheckpointPreviewPromptInput): string {
	const status = truncateForPrompt(input.statusPorcelain.trimEnd(), MAX_STATUS_CHARS, "git status --porcelain");
	const diff = truncateForPrompt(input.diffHead.trimEnd(), MAX_DIFF_CHARS, "git diff HEAD");
	const untracked = input.untrackedFiles.length === 0 ? "(none)" : input.untrackedFiles.map((file) => `- ${file}`).join("\n");

	return `Draft a dev-checkpoint commit message preview for the current working tree.

This is a preview-only operation. Do not run tools, do not stage files, do not commit, do not amend, and do not mutate the repository. Use only the evidence below.

Follow the dev-checkpoint message rules exactly:
- Output exactly one short subject line prefixed with \`[cp]\`.
- Keep the full subject line at or below 52 characters when possible.
- Use imperative mood with no trailing period.
- Then output a blank line followed by 1-3 bullets starting with \`- \`.
- No prose paragraphs, no markdown headers, no code fences, no trailers, and no closing remarks.

Branch: ${input.branch}

Untracked files that would be included by \`git add -A\`:
${untracked}

\`git status --porcelain\`:
\`\`\`text
${status || "(empty)"}
\`\`\`

\`git diff HEAD\`:
\`\`\`diff
${diff || "(empty)"}
\`\`\``;
}

export function untrackedFilesFromPorcelain(statusPorcelain: string): string[] {
	return statusPorcelain
		.split(/\r?\n/)
		.filter((line) => line.startsWith("?? "))
		.map((line) => line.slice(3).trim())
		.filter(Boolean);
}

export default function checkpointPreviewExtension(pi: ExtensionAPI): void {
	const register = (name: string) => {
		pi.registerCommand(name, {
			description: "Preview the dev-checkpoint [cp] commit message without staging or committing.",
			handler: async (args, ctx) => handleCheckpointPreviewCommand({ pi, commandName: name, rawArgs: args, ctx }),
		});
	};

	register(CHECKPOINT_PREVIEW_COMMAND_NAME);
	register(CHECKPOINT_PREVIEW_ALIAS_COMMAND_NAME);
}

interface HandleCheckpointPreviewCommandOptions {
	pi: ExtensionAPI;
	commandName: string;
	rawArgs: string;
	ctx: CommandContext;
}

async function handleCheckpointPreviewCommand(options: HandleCheckpointPreviewCommandOptions): Promise<void> {
	const { pi, commandName, rawArgs, ctx } = options;
	await ctx.waitForIdle();

	let parsedArgs: CheckpointPreviewArgs;
	try {
		parsedArgs = parseArgs(commandName, rawArgs);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		presentMessage({
			pi,
			ctx,
			content: `${reason}\n\n${USAGE}`,
			details: {
				status: "usage",
				command: commandName,
				cwd: ctx.cwd,
				reason,
			},
			level: "warning",
		});
		return;
	}
	if (parsedArgs.shouldShowHelp) {
		presentMessage({
			pi,
			ctx,
			content: USAGE,
			details: {
				status: "usage",
				command: commandName,
				cwd: ctx.cwd,
				reason: "help",
			},
			level: "info",
		});
		return;
	}

	let branch: string;
	let statusPorcelain: string;
	let diffHead: string;
	try {
		setStatus(ctx, "checking current branch…");
		branch = (await runGit(pi, ctx, ["symbolic-ref", "--short", "HEAD"])).stdout.trim();
		if (branch === "main" || branch === "master") {
			presentMessage({
				pi,
				ctx,
				content: `Refusing to preview a checkpoint message on ${branch}.`,
				details: {
					status: "rejected",
					command: commandName,
					cwd: ctx.cwd,
					branch,
					reason: "protected-branch",
				},
				level: "warning",
			});
			return;
		}

		setStatus(ctx, "checking working tree…");
		statusPorcelain = (await runGit(pi, ctx, ["status", "--porcelain"])).stdout;
		if (statusPorcelain.trim().length === 0) {
			presentMessage({
				pi,
				ctx,
				content: "Nothing to preview: the working tree is clean.",
				details: {
					status: "rejected",
					command: commandName,
					cwd: ctx.cwd,
					branch,
					reason: "clean-working-tree",
				},
				level: "info",
			});
			return;
		}

		setStatus(ctx, "capturing diff…");
		diffHead = (await runGit(pi, ctx, ["diff", "HEAD"])).stdout;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		presentMessage({
			pi,
			ctx,
			content: message,
			details: {
				status: "failure",
				command: commandName,
				cwd: ctx.cwd,
				reason: "git-command-failed",
			},
			level: "error",
		});
		return;
	} finally {
		setStatus(ctx, undefined);
	}

	const prompt = buildCheckpointPreviewPrompt({
		branch,
		statusPorcelain,
		diffHead,
		untrackedFiles: untrackedFilesFromPorcelain(statusPorcelain),
	});

	if (ctx.hasUI) {
		ctx.ui?.notify?.("Generating checkpoint message preview without staging or committing.", "info");
	}
	pi.sendUserMessage(prompt);
}

interface CheckpointPreviewArgs {
	shouldShowHelp: boolean;
}

function parseArgs(commandName: string, rawArgs: string): CheckpointPreviewArgs {
	const tokens = rawArgs.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return { shouldShowHelp: false };
	if (tokens.length === 1 && (tokens[0] === "--help" || tokens[0] === "-h")) return { shouldShowHelp: true };
	throw new CheckpointPreviewUsageError(`Unsupported /${commandName} argument: ${tokens[0] ?? ""}.`);
}

async function runGit(pi: ExtensionAPI, ctx: CommandContext, args: string[]): Promise<ExecResult> {
	const result = await pi.exec("git", args, { cwd: ctx.cwd, timeout: GIT_TIMEOUT_MS });
	if (result.code === 0 && !result.killed) return result;

	const command = formatCommand("git", args);
	const status = result.killed ? `exit code ${result.code}; process was killed or timed out` : `exit code ${result.code}`;
	const stderr = formatCapturedOutput(result.stderr);
	const stdout = formatCapturedOutput(result.stdout);
	throw new Error(`checkpoint preview failed while running ${command} (${status}).\n\nstdout:\n${stdout}\n\nstderr:\n${stderr}`);
}

interface PresentMessageOptions {
	pi: ExtensionAPI;
	ctx: CommandContext;
	content: string;
	details: CheckpointPreviewDetails;
	level: NotifyLevel;
}

function presentMessage(options: PresentMessageOptions): void {
	const { pi, ctx, content, details, level } = options;
	if (pi.sendMessage) {
		pi.sendMessage({ customType: MESSAGE_TYPE, content, display: true, details });
		return;
	}
	if (ctx.hasUI) {
		ctx.ui?.notify?.(content, level);
		return;
	}
	if (level === "error") {
		console.error(content);
		return;
	}
	console.log(content);
}

function formatCapturedOutput(text: string): string {
	const trimmed = text.trimEnd();
	if (trimmed === "") return "(empty)";
	return trimmed;
}

function setStatus(ctx: CommandContext, value: string | undefined): void {
	if (!ctx.hasUI) return;
	try {
		ctx.ui?.setStatus?.(STATUS_KEY, value);
	} catch {
		// Display-only status updates must not affect command behavior.
	}
}

function truncateForPrompt(text: string, maxChars: number, label: string): string {
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars)}\n\n[${label} truncated to the first ${maxChars} of ${text.length} characters for preview generation.]`;
}
