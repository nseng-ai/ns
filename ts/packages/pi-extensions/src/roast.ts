import {
	CLI_COMMAND_OUTPUT_MESSAGE_TYPE,
	formatCliCommandOutput,
	parseCliCommandArgs,
	type CliCommandOutputDetails,
} from "./cli-command-extension.ts";

const COMMAND_NAME = "roast";
const ROASTER_TIMEOUT_MS = 30 * 60 * 1000;

export interface ExecResult {
	stdout?: string;
	stderr?: string;
	code: number;
	killed?: boolean;
}

type NotifyLevel = "info" | "warning" | "error";

interface CustomMessage {
	customType: string;
	content: string;
	display: boolean;
	details?: unknown;
}

export interface ExtensionCommandContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setEditorText?(text: string): void;
		setStatus?(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
}

export interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description: string;
			handler(args: string, ctx: ExtensionCommandContext): Promise<void> | void;
		},
	): void;
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult>;
	sendMessage?(message: CustomMessage): void;
}

export default function roastExtension(pi: ExtensionAPI): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Run roaster reviewers whose when_changed globs match the current branch diff.",
		handler: async (rawArgs, ctx) => {
			await runRoast(pi, ctx, rawArgs);
		},
	});
}

export async function runRoast(pi: Pick<ExtensionAPI, "exec" | "sendMessage">, ctx: ExtensionCommandContext, rawArgs: string): Promise<void> {
	const parsed = parseCliCommandArgs(rawArgs);
	if (!parsed.ok) {
		restoreInvocationToEditor(ctx, rawArgs, `Could not parse /${COMMAND_NAME}: ${parsed.error}`);
		emitRoastOutput(
			pi,
			ctx,
			buildOutputDetails({
				rawArgs,
				args: [],
				cwd: ctx.cwd,
				exitCode: 2,
				stdout: "",
				stderr: `Error: ${parsed.error}\n`,
			}),
		);
		return;
	}

	await ctx.waitForIdle();
	const roasterArgs = buildRoasterArgs(parsed.args);

	if (ctx.hasUI) {
		ctx.ui.setStatus?.("roast", "running roaster…");
		ctx.ui.notify("Running matching roaster reviews…", "info");
	}

	let result: ExecResult;
	try {
		result = await pi.exec("uv", ["run", "roaster", ...roasterArgs], {
			cwd: ctx.cwd,
			timeout: ROASTER_TIMEOUT_MS,
		});
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus?.("roast", undefined);
		}
	}

	emitRoastOutput(
		pi,
		ctx,
		buildOutputDetails({
			rawArgs,
			args: parsed.args,
			cwd: ctx.cwd,
			exitCode: result.code,
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? "",
		}),
	);
}

export function buildRoasterArgs(userArgs: readonly string[]): string[] {
	const args = [...userArgs];
	if (hasHelpOption(args) || hasOption(args, "--review-format")) {
		return ["review", "run-matching", ...args];
	}

	return ["review", "run-matching", "--review-format", "findings", ...args];
}

function hasHelpOption(args: readonly string[]): boolean {
	return args.some((arg) => arg === "--help" || arg === "-h");
}

function hasOption(args: readonly string[], optionName: string): boolean {
	return args.some((arg) => arg === optionName || arg.startsWith(`${optionName}=`));
}

function buildOutputDetails(options: {
	rawArgs: string;
	args: readonly string[];
	cwd: string;
	exitCode: number;
	stdout: string;
	stderr: string;
}): CliCommandOutputDetails {
	return {
		cliName: "roaster",
		commandName: "review run-matching",
		piCommandName: COMMAND_NAME,
		rawArgs: options.rawArgs,
		args: [...options.args],
		argv: buildRoasterArgs(options.args),
		cwd: options.cwd,
		exitCode: options.exitCode,
		stdout: options.stdout,
		stderr: options.stderr,
		level: options.exitCode === 0 ? "info" : "error",
	};
}

function emitRoastOutput(pi: Pick<ExtensionAPI, "sendMessage">, ctx: ExtensionCommandContext, details: CliCommandOutputDetails): void {
	const content = formatCliCommandOutput(details);
	if (pi.sendMessage !== undefined) {
		pi.sendMessage({
			customType: CLI_COMMAND_OUTPUT_MESSAGE_TYPE,
			content,
			display: true,
			details,
		});
		return;
	}

	ctx.ui.notify(content, details.level);
}

function restoreInvocationToEditor(ctx: ExtensionCommandContext, rawArgs: string, reason: string): void {
	if (!ctx.hasUI || ctx.ui.setEditorText === undefined) {
		return;
	}

	const invocation = rawArgs === "" ? `/${COMMAND_NAME}` : `/${COMMAND_NAME} ${rawArgs}`;
	ctx.ui.setEditorText(invocation);
	ctx.ui.notify(`${reason} The text was restored to the editor.`, "warning");
}
