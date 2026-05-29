import { formatCommand, tailText, type ExecResult } from "./command-runtime.ts";

const OBJECTIVE_GT_STACKS_TIMEOUT_MS = 30_000;
const MAX_ERROR_CHARS = 4_000;
const OBJECTIVE_GT_STACKS_COMMAND_NAME = "objective-gt-stacks";
const OBJECTIVE_GT_STACKS_MESSAGE_TYPE = "objective-gt-stacks-output";

const OBJECTIVE_GT_STACKS_USAGE = `Usage: /objective-gt-stacks [--help]

Shows \`objective gt stacks\` output in chat. Output format is controlled by the Pi extension; --format and --json-schema are not supported.`;

const OBJECTIVE_GT_STACKS_ARG_COMPLETIONS = ["--help", "-h"] as const;

export type NotifyLevel = "info" | "warning" | "error";

export type AutocompleteItem = {
	value: string;
	label?: string;
	description?: string;
};

type CustomMessageContent = string | Array<{ type: string; text?: string }>;

type CustomMessage = {
	customType: string;
	content: CustomMessageContent;
	display: boolean;
	details?: unknown;
};

export type CommandContext = {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setStatus(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
};

export type ExtensionAPI = {
	registerCommand(
		name: string,
		options: {
			description?: string;
			getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult>;
	sendMessage?(message: CustomMessage, options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" }): void;
};

export type ObjectiveGtStacksParsedArgs = {
	help: boolean;
};

type ObjectiveGtStacksMessageDetails = {
	status: "success" | "failure" | "rejected";
	command: string;
	args: string[];
	cwd: string;
	code?: number;
	killed?: boolean;
	stdoutBytes?: number;
	stdoutChars?: number;
	stderrBytes?: number;
	stderrChars?: number;
};

class ObjectiveGtStacksUsageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ObjectiveGtStacksUsageError";
	}
}

function byteLength(text: string): number {
	return new TextEncoder().encode(text).length;
}

function truncateTail(text: string, maxChars: number): string {
	const tail = tailText(text, { maxChars });
	if (tail === text) {
		return text;
	}

	return `[Output truncated to the last ${maxChars} characters.]\n\n${tail.slice(1)}`;
}

function formatExecFailure(commandDisplay: string, result: ExecResult): string {
	const status = result.killed ? `exit code ${result.code}; process was killed or timed out` : `exit code ${result.code}`;
	const stdout = result.stdout.trimEnd() || "(empty)";
	const stderr = result.stderr.trimEnd() || "(empty)";
	return truncateTail(
		`objective gt stacks failed (${status}).\n\n$ ${commandDisplay}\n\nstdout:\n${stdout}\n\nstderr:\n${stderr}`,
		MAX_ERROR_CHARS,
	);
}

function formatExecStartupFailure(commandDisplay: string, error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return truncateTail(
		`objective gt stacks failed before completion.\n\n$ ${commandDisplay}\n\nerror:\n${message}`,
		MAX_ERROR_CHARS,
	);
}

function tokenizeArgumentString(args: string): string[] {
	return args.trim().split(/\s+/).filter(Boolean);
}

export function parseObjectiveGtStacksArgs(rawArgs: string): ObjectiveGtStacksParsedArgs {
	const tokens = tokenizeArgumentString(rawArgs);

	let help = false;
	for (const token of tokens) {
		if (token === "--help" || token === "-h") {
			help = true;
			continue;
		}
		if (token === "--format" || token.startsWith("--format=")) {
			throw new ObjectiveGtStacksUsageError(
				"--format is controlled by the Pi extension and is not supported here.",
			);
		}
		if (token === "--json-schema" || token.startsWith("--json-schema=")) {
			throw new ObjectiveGtStacksUsageError("--json-schema is not supported by /objective-gt-stacks.");
		}
		if (token.startsWith("-")) {
			throw new ObjectiveGtStacksUsageError(`Unsupported /${OBJECTIVE_GT_STACKS_COMMAND_NAME} argument: ${token}.`);
		}

		throw new ObjectiveGtStacksUsageError(
			`/${OBJECTIVE_GT_STACKS_COMMAND_NAME} takes no positional arguments; got: ${token}.`,
		);
	}

	return { help };
}

function objectiveGtStacksUsage(error: string): string {
	return `Error: ${error}\n\n${OBJECTIVE_GT_STACKS_USAGE}`;
}

export function completeObjectiveGtStacksArgs(prefix: string): AutocompleteItem[] | null {
	const tokens = tokenizeArgumentString(prefix);
	const endsWithWhitespace = /\s$/.test(prefix);
	const currentToken = endsWithWhitespace ? "" : (tokens[tokens.length - 1] ?? "");

	const filtered = OBJECTIVE_GT_STACKS_ARG_COMPLETIONS.filter((candidate) => candidate.startsWith(currentToken));
	return filtered.length > 0 ? filtered.map((value) => ({ value, label: value })) : null;
}

async function handleObjectiveGtStacksCommand(pi: ExtensionAPI, rawArgs: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();

	let parsedArgs: ObjectiveGtStacksParsedArgs;
	try {
		parsedArgs = parseObjectiveGtStacksArgs(rawArgs);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		presentObjectiveGtStacksMessage(
			pi,
			ctx,
			objectiveGtStacksUsage(message),
			{
				status: "rejected",
				command: OBJECTIVE_GT_STACKS_COMMAND_NAME,
				args: tokenizeArgumentString(rawArgs),
				cwd: ctx.cwd,
			},
			"warning",
		);
		return;
	}

	const commandArgs = parsedArgs.help ? ["gt", "stacks", "--help"] : ["gt", "stacks", "--format", "markdown"];
	const commandDisplay = formatCommand("objective", commandArgs);

	if (ctx.hasUI) {
		ctx.ui.setStatus(OBJECTIVE_GT_STACKS_COMMAND_NAME, `running ${commandDisplay}…`);
	}

	let result: ExecResult;
	try {
		result = await pi.exec("objective", commandArgs, {
			cwd: ctx.cwd,
			timeout: OBJECTIVE_GT_STACKS_TIMEOUT_MS,
		});
	} catch (error) {
		presentObjectiveGtStacksMessage(
			pi,
			ctx,
			formatExecStartupFailure(commandDisplay, error),
			{
				status: "failure",
				command: commandDisplay,
				args: commandArgs,
				cwd: ctx.cwd,
			},
			"error",
		);
		return;
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus(OBJECTIVE_GT_STACKS_COMMAND_NAME, undefined);
		}
	}

	if (result.code !== 0 || result.killed) {
		presentObjectiveGtStacksMessage(
			pi,
			ctx,
			formatExecFailure(commandDisplay, result),
			objectiveGtStacksDetails("failure", commandDisplay, commandArgs, ctx, result),
			"error",
		);
		return;
	}

	presentObjectiveGtStacksMessage(
		pi,
		ctx,
		objectiveGtStacksOutputContent(result),
		objectiveGtStacksDetails("success", commandDisplay, commandArgs, ctx, result),
		"info",
	);
}

function objectiveGtStacksDetails(
	status: "success" | "failure",
	command: string,
	args: string[],
	ctx: CommandContext,
	result: ExecResult,
): ObjectiveGtStacksMessageDetails {
	return {
		status,
		command,
		args,
		cwd: ctx.cwd,
		code: result.code,
		killed: result.killed,
		stdoutBytes: byteLength(result.stdout),
		stdoutChars: result.stdout.length,
		stderrBytes: byteLength(result.stderr),
		stderrChars: result.stderr.length,
	};
}

function objectiveGtStacksOutputContent(result: ExecResult): string {
	const stdout = result.stdout.trimEnd();
	if (stdout) {
		return stdout;
	}

	const stderr = result.stderr.trimEnd();
	return stderr || "(empty)";
}

function presentObjectiveGtStacksMessage(
	pi: ExtensionAPI,
	ctx: CommandContext,
	content: string,
	details: ObjectiveGtStacksMessageDetails,
	level: NotifyLevel,
): void {
	if (pi.sendMessage) {
		pi.sendMessage({
			customType: OBJECTIVE_GT_STACKS_MESSAGE_TYPE,
			content,
			display: true,
			details,
		});
		return;
	}

	if (ctx.hasUI) {
		ctx.ui.notify(content, level);
		return;
	}

	if (level === "error") {
		console.error(content);
		return;
	}

	console.log(content);
}

export default function objectiveGtStacksExtension(pi: ExtensionAPI): void {
	pi.registerCommand(OBJECTIVE_GT_STACKS_COMMAND_NAME, {
		description: "Show Objective work across Graphite-tracked branches without invoking the agent.",
		getArgumentCompletions: completeObjectiveGtStacksArgs,
		handler: async (args, ctx) => handleObjectiveGtStacksCommand(pi, args, ctx),
	});
}
