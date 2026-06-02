import process from "node:process";

import { customMessageText, truncateDisplayLine } from "./terminal-presentation.ts";

export const CLI_COMMAND_OUTPUT_MESSAGE_TYPE = "cli-command-output";

type NotifyLevel = "info" | "warning" | "error";

export interface CliCommandInfo {
	name: string;
	description: string;
	canAcceptPositionalArgs?: boolean;
}

export interface CliCommandRunDeps {
	cwd: string;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	env: Record<string, string | undefined>;
}

export interface CliCommandExtensionSpec {
	cliName: string;
	piNamespace: string;
	commands: readonly CliCommandInfo[];
	runCli(args: readonly string[], deps: CliCommandRunDeps): Promise<number> | number;
	env?: Record<string, string | undefined>;
}

export interface CustomMessage {
	customType: string;
	content: string;
	display: boolean;
	details?: unknown;
}

type RenderTheme = {
	fg(color: string, text: string): string;
	bold?(text: string): string;
};

type RenderComponent = {
	render(width: number): string[];
	invalidate(): void;
};

type MessageRenderer = (message: CustomMessage, options: { expanded: boolean }, theme: RenderTheme) => RenderComponent;

export interface CommandContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setEditorText?(text: string): void;
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
	registerMessageRenderer?(customType: string, renderer: MessageRenderer): void;
	sendMessage?(message: CustomMessage, options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" }): void;
}

export type ParsedCliCommandArgs =
	| {
			ok: true;
			args: string[];
	  }
	| {
			ok: false;
			error: string;
	  };

export interface CliCommandOutputDetails {
	cliName: string;
	commandName: string;
	piCommandName: string;
	rawArgs: string;
	args: string[];
	argv: string[];
	cwd: string;
	exitCode: number;
	stdout: string;
	stderr: string;
	level: "info" | "error";
}

export function registerCliCommandExtension(pi: ExtensionAPI, spec: CliCommandExtensionSpec): void {
	assertValidCommandSpec(spec);
	pi.registerMessageRenderer?.(CLI_COMMAND_OUTPUT_MESSAGE_TYPE, renderCliCommandOutputMessage);

	for (const command of spec.commands) {
		const piCommandName = `${spec.piNamespace}:${command.name}`;
		pi.registerCommand(piCommandName, {
			description: `${spec.cliName} ${command.name}: ${command.description}`,
			handler: async (rawArgs, ctx) => {
				await runRegisteredCliCommand({ pi, spec, command, piCommandName, rawArgs, ctx });
			},
		});
	}
}

export function parseCliCommandArgs(rawArgs: string): ParsedCliCommandArgs {
	const args: string[] = [];
	let current = "";
	let quote: "single" | "double" | undefined;
	let escaping = false;
	let tokenStarted = false;

	for (let index = 0; index < rawArgs.length; index += 1) {
		const char = rawArgs.charAt(index);

		if (escaping) {
			current += char;
			escaping = false;
			tokenStarted = true;
			continue;
		}

		if (quote === "single") {
			if (char === "'") {
				quote = undefined;
			} else {
				current += char;
			}
			tokenStarted = true;
			continue;
		}

		if (quote === "double") {
			if (char === "\\") {
				escaping = true;
				tokenStarted = true;
				continue;
			}
			if (char === '"') {
				quote = undefined;
				tokenStarted = true;
				continue;
			}
			current += char;
			tokenStarted = true;
			continue;
		}

		if (char === "\\") {
			escaping = true;
			tokenStarted = true;
			continue;
		}
		if (char === "'") {
			quote = "single";
			tokenStarted = true;
			continue;
		}
		if (char === '"') {
			quote = "double";
			tokenStarted = true;
			continue;
		}
		if (/\s/.test(char)) {
			if (tokenStarted) {
				args.push(current);
				current = "";
				tokenStarted = false;
			}
			continue;
		}

		current += char;
		tokenStarted = true;
	}

	if (escaping) {
		return { ok: false, error: "Trailing backslash escape." };
	}
	if (quote === "single") {
		return { ok: false, error: "Unterminated single quote." };
	}
	if (quote === "double") {
		return { ok: false, error: "Unterminated double quote." };
	}
	if (tokenStarted) {
		args.push(current);
	}

	return { ok: true, args };
}

export function formatCliCommandOutput(details: CliCommandOutputDetails): string {
	const sourceCommand = `${details.cliName} ${details.commandName}`;
	if (details.exitCode === 0) {
		return formatSuccessfulOutput(sourceCommand, details.stdout, details.stderr);
	}

	return formatFailedOutput({ sourceCommand, exitCode: details.exitCode, stdout: details.stdout, stderr: details.stderr });
}

interface RunRegisteredCliCommandOptions {
	pi: ExtensionAPI;
	spec: CliCommandExtensionSpec;
	command: CliCommandInfo;
	piCommandName: string;
	rawArgs: string;
	ctx: CommandContext;
}

async function runRegisteredCliCommand(options: RunRegisteredCliCommandOptions): Promise<void> {
	const { pi, spec, command, piCommandName, rawArgs, ctx } = options;
	const parsed = parseCliCommandArgs(rawArgs);
	if (!parsed.ok) {
		restoreCommandInvocationToEditor({ ctx, piCommandName, rawArgs, reason: `Could not parse /${piCommandName}: ${parsed.error}` });
		emitCliCommandOutput(
			pi,
			ctx,
			buildOutputDetails({
				spec,
				command,
				piCommandName,
				rawArgs,
				args: [],
				cwd: ctx.cwd,
				result: {
					exitCode: 2,
					stdout: "",
					stderr: `Error: ${parsed.error}\n`,
				},
			}),
		);
		return;
	}

	if (startsWithPositionalArgs(parsed.args) && command.canAcceptPositionalArgs !== true) {
		const restored = restoreCommandInvocationToEditor({
			ctx,
			piCommandName,
			rawArgs,
			reason: `Not running /${piCommandName}: text after the command looks like prose, not options.`,
		});
		if (!restored) {
			emitCliCommandOutput(
				pi,
				ctx,
				buildOutputDetails({
					spec,
					command,
					piCommandName,
					rawArgs,
					args: parsed.args,
					cwd: ctx.cwd,
					result: {
						exitCode: 2,
						stdout: "",
						stderr: `Error: /${piCommandName} only accepts option-style arguments here. Use --help for usage.\n`,
					},
				}),
			);
		}
		return;
	}

	await ctx.waitForIdle();

	let stdout = "";
	let stderr = "";
	let exitCode = 1;
	const argv = [command.name, ...parsed.args];
	try {
		exitCode = await spec.runCli(argv, {
			cwd: ctx.cwd,
			stdout: (text) => {
				stdout += text;
			},
			stderr: (text) => {
				stderr += text;
			},
			env: { ...(spec.env ?? process.env) },
		});
	} catch (error) {
		stderr += `Unhandled ${spec.cliName} command error: ${errorMessage(error)}\n`;
	}

	const details = buildOutputDetails({
		spec,
		command,
		piCommandName,
		rawArgs,
		args: parsed.args,
		cwd: ctx.cwd,
		result: {
			exitCode,
			stdout,
			stderr,
		},
	});
	emitCliCommandOutput(pi, ctx, details);
	if (isCliUsageError(details)) {
		restoreCommandInvocationToEditor({ ctx, piCommandName, rawArgs, reason: `Restored /${piCommandName} after a CLI usage error.` });
	}
}

interface BuildOutputDetailsOptions {
	spec: Pick<CliCommandExtensionSpec, "cliName">;
	command: CliCommandInfo;
	piCommandName: string;
	rawArgs: string;
	args: readonly string[];
	cwd: string;
	result: { exitCode: number; stdout: string; stderr: string };
}

function buildOutputDetails(options: BuildOutputDetailsOptions): CliCommandOutputDetails {
	const { spec, command, piCommandName, rawArgs, args, cwd, result } = options;
	return {
		cliName: spec.cliName,
		commandName: command.name,
		piCommandName,
		rawArgs,
		args: [...args],
		argv: [command.name, ...args],
		cwd,
		exitCode: result.exitCode,
		stdout: result.stdout,
		stderr: result.stderr,
		level: result.exitCode === 0 ? "info" : "error",
	};
}

function startsWithPositionalArgs(args: readonly string[]): boolean {
	const first = args[0];
	return first !== undefined && (first === "--" || !first.startsWith("-"));
}

interface RestoreCommandInvocationOptions {
	ctx: CommandContext;
	piCommandName: string;
	rawArgs: string;
	reason: string;
}

function restoreCommandInvocationToEditor(options: RestoreCommandInvocationOptions): boolean {
	const { ctx, piCommandName, rawArgs, reason } = options;
	if (!ctx.hasUI || ctx.ui.setEditorText === undefined) {
		return false;
	}

	ctx.ui.setEditorText(formatPiCommandInvocation(piCommandName, rawArgs));
	ctx.ui.notify(`${reason} The text was restored to the editor.`, "warning");
	return true;
}

function formatPiCommandInvocation(piCommandName: string, rawArgs: string): string {
	return rawArgs === "" ? `/${piCommandName}` : `/${piCommandName} ${rawArgs}`;
}

function isCliUsageError(details: CliCommandOutputDetails): boolean {
	return details.exitCode === 2 && details.stderr.startsWith("Error:");
}

function emitCliCommandOutput(pi: ExtensionAPI, ctx: CommandContext, details: CliCommandOutputDetails): void {
	const displayText = formatCliCommandOutput(details);
	const message: CustomMessage = {
		customType: CLI_COMMAND_OUTPUT_MESSAGE_TYPE,
		content: formatCliCommandContextSummary(details),
		display: false,
		details,
	};

	if (ctx.hasUI) {
		ctx.ui.notify(displayText, details.level);
	}

	if (pi.sendMessage !== undefined) {
		pi.sendMessage(message, { triggerTurn: false });
		return;
	}

	if (!ctx.hasUI) {
		const stream = details.level === "info" ? process.stdout : process.stderr;
		stream.write(displayText.endsWith("\n") ? displayText : `${displayText}\n`);
	}
}

export function renderCliCommandOutputMessage(message: CustomMessage, _options: { expanded: boolean }, theme: RenderTheme): RenderComponent {
	const details = parseCliCommandOutputDetails(message.details);
	const displayText = details === undefined ? customMessageText(message.content) : formatCliCommandOutput(details);
	return {
		render(width: number): string[] {
			return displayText.split("\n").map((line, index) => styleCliOutputLine(truncateDisplayLine(line, width), index, details?.level, theme));
		},
		invalidate(): void {},
	};
}

function formatCliCommandContextSummary(details: CliCommandOutputDetails): string {
	const sourceCommand = `/${details.piCommandName}`;
	if (details.exitCode === 0) {
		return `The ${sourceCommand} command completed successfully.`;
	}
	return `The ${sourceCommand} command exited with code ${details.exitCode}.`;
}

function styleCliOutputLine(line: string, index: number, level: "info" | "error" | undefined, theme: RenderTheme): string {
	if (line.length === 0) return line;
	if (index === 0) {
		const text = theme.bold !== undefined ? theme.bold(line) : line;
		return theme.fg(level === "error" ? "error" : "accent", text);
	}
	if (/^(stdout|stderr):$/.test(line) || /^----- (stdout|stderr) -----$/.test(line)) {
		return theme.fg("muted", line);
	}
	return line;
}

function parseCliCommandOutputDetails(value: unknown): CliCommandOutputDetails | undefined {
	if (!isRecord(value)) return undefined;
	if (
		typeof value.cliName !== "string" ||
		typeof value.commandName !== "string" ||
		typeof value.piCommandName !== "string" ||
		typeof value.rawArgs !== "string" ||
		!Array.isArray(value.args) ||
		!value.args.every((item) => typeof item === "string") ||
		!Array.isArray(value.argv) ||
		!value.argv.every((item) => typeof item === "string") ||
		typeof value.cwd !== "string" ||
		typeof value.exitCode !== "number" ||
		typeof value.stdout !== "string" ||
		typeof value.stderr !== "string" ||
		(value.level !== "info" && value.level !== "error")
	) {
		return undefined;
	}

	return {
		cliName: value.cliName,
		commandName: value.commandName,
		piCommandName: value.piCommandName,
		rawArgs: value.rawArgs,
		args: [...value.args],
		argv: [...value.argv],
		cwd: value.cwd,
		exitCode: value.exitCode,
		stdout: value.stdout,
		stderr: value.stderr,
		level: value.level,
	};
}

function formatSuccessfulOutput(sourceCommand: string, stdout: string, stderr: string): string {
	if (stdout !== "" && stderr === "") {
		return stdout;
	}
	if (stdout === "" && stderr !== "") {
		return `stderr:\n${stderr}`;
	}
	if (stdout !== "" && stderr !== "") {
		return `stdout:\n${stdout}\nstderr:\n${stderr}`;
	}

	return `${sourceCommand} completed successfully with no output.`;
}

interface FailedOutputOptions {
	sourceCommand: string;
	exitCode: number;
	stdout: string;
	stderr: string;
}

function formatFailedOutput(options: FailedOutputOptions): string {
	const { sourceCommand, exitCode, stdout, stderr } = options;
	if (stdout === "" && stderr === "") {
		return `${sourceCommand} exited with code ${exitCode} with no output.`;
	}

	const sections = [`${sourceCommand} exited with code ${exitCode}.`];
	if (stdout !== "") {
		sections.push(`stdout:\n${stdout}`);
	}
	if (stderr !== "") {
		sections.push(`stderr:\n${stderr}`);
	}
	return sections.join("\n\n");
}

function assertValidCommandSpec(spec: CliCommandExtensionSpec): void {
	if (spec.cliName.trim() === "") {
		throw new Error("CLI command extension requires a non-empty cliName.");
	}
	if (spec.piNamespace.trim() === "") {
		throw new Error(`CLI command extension for ${spec.cliName} requires a non-empty piNamespace.`);
	}

	const seenNames = new Set<string>();
	for (const command of spec.commands) {
		if (command.name.trim() === "") {
			throw new Error(`CLI command extension for ${spec.cliName} includes an empty command name.`);
		}
		if (seenNames.has(command.name)) {
			throw new Error(`Duplicate ${spec.cliName} command name: ${command.name}`);
		}
		seenNames.add(command.name);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}
