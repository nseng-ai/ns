import process from "node:process";

import { registerCommandWithImmediateAck } from "./ack.ts";
import { parseCliCommandArgs, type ParsedCliCommandArgs } from "./args.ts";
import { formatErrorMessage } from "@ji/core/primitives";
import type { NotifyLevel } from "../runtime/tool-types.ts";
import { LiveCommandProgress } from "./cli-command-live-progress.ts";
import { outputTraceFields, traceCliCommand } from "./cli-command-trace.ts";
import { emitPiExtensionCommandFinished, type PiExtensionCommandEventEmitter } from "./events.ts";
import { withSafePiUi } from "../kit/shared/safe-ui.ts";
import {
	customMessageText,
	truncateDisplayLine,
	type CustomMessageContent,
} from "../kit/terminal/presentation.ts";
import type { SdlConfirmOptions } from "@ji/kernel/sdk";

export { cliCommandTracePath } from "./cli-command-trace.ts";

export const CLI_COMMAND_OUTPUT_MESSAGE_TYPE = "ns-cli-command-output";

type OutputStreamName = "stdout" | "stderr";
type CommandWidgetPlacement = "aboveEditor" | "belowEditor";

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

export interface CliCommandCompletionItem {
	value: string;
	label?: string;
}

export type CliCommandArgumentMapper = (args: readonly string[]) => ParsedCliCommandArgs;

export interface CliCommandInfo {
	name: string;
	description: string;
	canAcceptPositionalArgs?: boolean;
	startMessage?: string;
	argvPrefix?: readonly string[];
	displayName?: string;
	argumentHint?: string;
	getArgumentCompletions?: (prefix: string) => CliCommandCompletionItem[] | null;
	mapParsedArgs?: CliCommandArgumentMapper;
}

export type CliCommandConfirmPrompt = (
	title: string,
	message: string,
	options?: SdlConfirmOptions,
) => Promise<boolean> | boolean;

export interface CliCommandRunDeps {
	cwd: string;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	env: Record<string, string | undefined>;
	/**
	 * Emits transient live-progress text for the Pi widget/status path only.
	 * Text sent here is not included in the final rendered command result; use
	 * stdout/stderr for output that should remain visible after the command ends.
	 */
	onOutput?: (stream: OutputStreamName, text: string) => void;
	confirm?: CliCommandConfirmPrompt;
}

export interface CliCommandExtensionSpec {
	cliName: string;
	piNamespace: string;
	commands: readonly CliCommandInfo[];
	runCli(args: readonly string[], deps: CliCommandRunDeps): Promise<number> | number;
	/**
	 * Narrow CLI-adapter completion hook for awaited, adapter-local side effects
	 * such as refreshing Pi worktree status after slash-command execution.
	 * The extension command event remains best-effort activity/observability;
	 * consumers that need ordered completion should use this hook instead of
	 * transient inter-extension pub/sub.
	 */
	afterCommandComplete?: (details: CliCommandOutputDetails) => Promise<void> | void;
	env?: Record<string, string | undefined>;
	piCommandAliases?: Readonly<Record<string, string>>;
}

export interface CommandContext {
	cwd: string;
	hasUI?: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		confirm?(
			title: string,
			message: string,
			options?: SdlConfirmOptions,
		): Promise<boolean> | boolean;
		setEditorText?(text: string): void;
		setStatus?(key: string, value: string | undefined): void;
		setWidget?(
			key: string,
			value: string[] | undefined,
			options?: { placement?: CommandWidgetPlacement },
		): void;
	};
	waitForIdle(): Promise<void>;
}

export interface CliCommandExtensionAPI {
	readonly events?: PiExtensionCommandEventEmitter;
	registerCommand(
		name: string,
		options: {
			description?: string;
			argumentHint?: string;
			getArgumentCompletions?: (
				prefix: string,
			) => Promise<CliCommandCompletionItem[] | null> | CliCommandCompletionItem[] | null;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	registerMessageRenderer?(customType: string, renderer: MessageRenderer): void;
	sendMessage?(message: CustomMessage): void;
}

export { parseCliCommandArgs } from "./args.ts";
export type { ParsedCliCommandArgs } from "./args.ts";

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
	level: NotifyLevel;
}

export function selectCliCommands<TCommand extends CliCommandInfo>(options: {
	availableCommands: readonly TCommand[];
	names: readonly string[];
	missingCommandLabel: string;
}): TCommand[] {
	const commandsByName = new Map(
		options.availableCommands.map((command) => [command.name, command]),
	);
	return options.names.map((name) => {
		const command = commandsByName.get(name);
		if (command === undefined) {
			throw new Error(`Missing ${options.missingCommandLabel} command: ${name}`);
		}
		return command;
	});
}

export function registerCliCommandExtension(
	pi: CliCommandExtensionAPI,
	spec: CliCommandExtensionSpec,
): void {
	assertValidCommandSpec(spec);
	pi.registerMessageRenderer?.(CLI_COMMAND_OUTPUT_MESSAGE_TYPE, renderCliCommandOutputMessage);
	traceCliCommand("register", {
		bridgeMode: "custom-rendered-message-with-above-editor-live-stream",
		cliName: spec.cliName,
		commands: spec.commands.map((command) => command.name),
		messageRendererAvailable: hasMessageRenderer(pi),
		piNamespace: spec.piNamespace,
		sendMessageAvailable: hasSendMessage(pi),
	});

	for (const command of spec.commands) {
		const piCommandName = resolvePiCommandName(spec, command);
		registerCommandWithImmediateAck({
			host: pi,
			commandName: piCommandName,
			commandDefinition: {
				description: `${spec.cliName} ${commandDisplayName(command)}: ${command.description}`,
				...(command.argumentHint === undefined ? {} : { argumentHint: command.argumentHint }),
				...(command.getArgumentCompletions === undefined
					? {}
					: { getArgumentCompletions: command.getArgumentCompletions }),
				handler: async (rawArgs, ctx) => {
					await runRegisteredCliCommand({
						pi,
						spec,
						command,
						piCommandName,
						rawArgs,
						ctx,
					});
				},
			},
			// CLI-backed commands render their own live progress block above the editor.
			// Suppress the generic footer ack so the same command-running state is not
			// shown both above and below the fold.
			options: { delivery: "none" },
		});
	}
}

export function formatCliCommandOutput(details: CliCommandOutputDetails): string {
	const sourceCommand = `${details.cliName} ${details.commandName}`;
	if (details.exitCode === 0) {
		return formatSuccessfulOutput(sourceCommand, details.stdout, details.stderr);
	}

	return formatFailedOutput({
		sourceCommand,
		exitCode: details.exitCode,
		stdout: details.stdout,
		stderr: details.stderr,
	});
}

export function renderCliCommandOutputMessage(
	message: CustomMessage,
	_options: { expanded: boolean },
	theme: RenderTheme,
): RenderComponent {
	const content = customMessageText(message.content);
	const level = cliCommandMessageLevel(message.details);
	return {
		render(width: number): string[] {
			return content.split("\n").map((line, index) =>
				styleCliCommandOutputLine({
					line: truncateDisplayLine(line, width),
					index,
					level,
					theme,
				}),
			);
		},
		invalidate(): void {},
	};
}

interface RunRegisteredCliCommandOptions {
	pi: CliCommandExtensionAPI;
	spec: CliCommandExtensionSpec;
	command: CliCommandInfo;
	piCommandName: string;
	rawArgs: string;
	ctx: CommandContext;
}

async function runRegisteredCliCommand(options: RunRegisteredCliCommandOptions): Promise<void> {
	const { pi, spec, command, piCommandName, rawArgs, ctx } = options;
	const commandStartedAt = Date.now();
	traceCliCommand("command_start", {
		cliName: spec.cliName,
		commandName: command.name,
		cwd: ctx.cwd,
		hasUI: ctx.hasUI,
		piCommandName,
		rawArgs,
		sendMessageAvailable: hasSendMessage(pi),
	});

	const parsed = parseCliCommandArgs(rawArgs);
	if (!parsed.ok) {
		const restored = restoreCommandInvocationToEditor({
			ctx,
			piCommandName,
			rawArgs,
			reason: `Could not parse /${piCommandName}: ${parsed.error}`,
		});
		traceCliCommand("parse_error", {
			commandName: command.name,
			error: parsed.error,
			piCommandName,
			restored,
		});
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

	const mapped = command.mapParsedArgs?.(parsed.args) ?? parsed;
	if (!mapped.ok) {
		const restored = restoreCommandInvocationToEditor({
			ctx,
			piCommandName,
			rawArgs,
			reason: `Could not run /${piCommandName}: ${mapped.error}`,
		});
		traceCliCommand("argument_map_error", {
			args: parsed.args,
			commandName: command.name,
			error: mapped.error,
			piCommandName,
			restored,
		});
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
					stderr: `Error: ${mapped.error}\n`,
				},
			}),
		);
		return;
	}
	const commandArgs = mapped.args;

	if (startsWithPositionalArgs(commandArgs) && command.canAcceptPositionalArgs !== true) {
		const restored = restoreCommandInvocationToEditor({
			ctx,
			piCommandName,
			rawArgs,
			reason: `Not running /${piCommandName}: text after the command looks like prose, not options.`,
		});
		traceCliCommand("positional_args_rejected", {
			args: commandArgs,
			commandName: command.name,
			piCommandName,
			restored,
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
					args: commandArgs,
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

	let stdout = "";
	let stderr = "";
	let hasLiveOutput = false;
	let exitCode = 1;
	const argv = [...commandArgvPrefix(command), ...commandArgs];
	emitCliCommandStart(ctx, command.startMessage);
	const progress = new LiveCommandProgress(ctx, {
		argv,
		cliName: spec.cliName,
		commandName: commandDisplayName(command),
		piCommandName,
	});
	try {
		progress.setPhase("waiting for Pi to finish responding");
		const waitStartedAt = Date.now();
		traceCliCommand("wait_for_idle_start", { commandName: command.name, piCommandName });
		await ctx.waitForIdle();
		traceCliCommand("wait_for_idle_done", {
			commandName: command.name,
			elapsedMs: Date.now() - waitStartedAt,
			piCommandName,
		});

		progress.setPhase("running CLI command");
		const runnerStartedAt = Date.now();
		traceCliCommand("runner_start", { argv, commandName: command.name, piCommandName });
		const runDeps: CliCommandRunDeps = {
			cwd: ctx.cwd,
			stdout: (text) => {
				stdout += text;
				if (!hasLiveOutput) {
					progress.appendOutput("stdout", text);
				}
			},
			stderr: (text) => {
				stderr += text;
				if (!hasLiveOutput) {
					progress.appendOutput("stderr", text);
				}
			},
			env: { ...(spec.env ?? process.env) },
			onOutput: (stream, text) => {
				hasLiveOutput = true;
				progress.appendOutput(stream, text);
			},
		};
		if (ctx.hasUI && ctx.ui.confirm !== undefined) {
			const confirm = ctx.ui.confirm;
			runDeps.confirm = async (title, message, options) => {
				progress.setPhase("waiting for confirmation");
				try {
					return await confirm(title, message, options);
				} finally {
					progress.setPhase("running CLI command");
				}
			};
		}
		try {
			exitCode = await spec.runCli(argv, runDeps);
		} catch (error) {
			const message = formatErrorMessage(error);
			const exceptionOutput = `Unhandled ${spec.cliName} command error: ${message}\n`;
			traceCliCommand("runner_exception", {
				commandName: command.name,
				error: message,
				piCommandName,
			});
			stderr += exceptionOutput;
			progress.appendOutput("stderr", exceptionOutput);
		}

		traceCliCommand("runner_done", {
			...outputTraceFields(stdout, stderr),
			commandName: command.name,
			elapsedMs: Date.now() - runnerStartedAt,
			exitCode,
			piCommandName,
			totalElapsedMs: Date.now() - commandStartedAt,
		});
	} finally {
		progress.close();
	}

	const details = buildOutputDetails({
		spec,
		command,
		piCommandName,
		rawArgs,
		args: commandArgs,
		cwd: ctx.cwd,
		result: {
			exitCode,
			stdout,
			stderr,
		},
	});
	emitCliCommandOutput(pi, ctx, details);
	// Registered slash-command handlers do not produce a Pi lifecycle completion event;
	// publish a custom extension-bus notification for observers such as worktree status.
	emitPiExtensionCommandFinished(pi.events, {
		commandName: piCommandName,
		cwd: ctx.cwd,
		source: `${spec.cliName} ${commandDisplayName(command)}`,
		status: "completed",
		exitCode: details.exitCode,
	});
	if (isCliUsageError(details)) {
		const restored = restoreCommandInvocationToEditor({
			ctx,
			piCommandName,
			rawArgs,
			reason: `Restored /${piCommandName} after a CLI usage error.`,
		});
		traceCliCommand("usageError_restored", { commandName: command.name, piCommandName, restored });
	}
	await spec.afterCommandComplete?.(details);
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
		commandName: commandDisplayName(command),
		piCommandName,
		rawArgs,
		args: [...args],
		argv: [...commandArgvPrefix(command), ...args],
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

function emitCliCommandStart(ctx: CommandContext, message: string | undefined): void {
	if (message === undefined || !ctx.hasUI) return;

	ctx.ui.notify(message, "info");
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

function resolvePiCommandName(spec: CliCommandExtensionSpec, command: CliCommandInfo): string {
	return spec.piCommandAliases?.[command.name] ?? `${spec.piNamespace}:${command.name}`;
}

function commandArgvPrefix(command: CliCommandInfo): readonly string[] {
	return command.argvPrefix ?? [command.name];
}

function commandDisplayName(command: CliCommandInfo): string {
	return command.displayName ?? commandArgvPrefix(command).join(" ");
}

function isCliUsageError(details: CliCommandOutputDetails): boolean {
	return (
		details.exitCode === 2 &&
		(details.stderr.startsWith("Error:") || details.stderr.startsWith("error:"))
	);
}

function emitCliCommandOutput(
	pi: CliCommandExtensionAPI,
	ctx: CommandContext,
	details: CliCommandOutputDetails,
): void {
	const displayText = formatCliCommandOutput(details);
	const sendMessage = pi.sendMessage;
	const canSendRenderedMessage =
		ctx.hasUI && sendMessage !== undefined && pi.registerMessageRenderer !== undefined;
	const target = canSendRenderedMessage
		? "custom_message"
		: ctx.hasUI
			? "notify"
			: details.level === "info"
				? "stdout"
				: "stderr";
	traceCliCommand("emit_output", {
		commandName: details.commandName,
		displayChars: displayText.length,
		hasUI: ctx.hasUI,
		level: details.level,
		messageRendererAvailable: hasMessageRenderer(pi),
		piCommandName: details.piCommandName,
		sendMessageAvailable: hasSendMessage(pi),
		sendMessageCalled: canSendRenderedMessage,
		target,
	});
	if (canSendRenderedMessage) {
		const sendResult = withSafePiUi(() => {
			sendMessage({
				customType: CLI_COMMAND_OUTPUT_MESSAGE_TYPE,
				content: displayText,
				display: true,
				details,
			});
		});
		if (sendResult.type === "stale-context") {
			traceCliCommand("emit_output_stale_context", {
				commandName: details.commandName,
				piCommandName: details.piCommandName,
				target,
			});
		}
		return;
	}
	if (ctx.hasUI) {
		withSafePiUi(() => {
			ctx.ui.notify(displayText, details.level);
		});
		return;
	}

	const stream = details.level === "info" ? process.stdout : process.stderr;
	stream.write(displayText.endsWith("\n") ? displayText : `${displayText}\n`);
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

function hasSendMessage(pi: CliCommandExtensionAPI): boolean {
	return typeof pi.sendMessage === "function";
}

function hasMessageRenderer(pi: CliCommandExtensionAPI): boolean {
	return typeof pi.registerMessageRenderer === "function";
}

function cliCommandMessageLevel(details: unknown): NotifyLevel {
	if (isRecord(details) && details.level === "error") return "error";
	if (isRecord(details) && details.level === "warning") return "warning";
	return "info";
}

interface StyleCliCommandOutputLineOptions {
	line: string;
	index: number;
	level: NotifyLevel;
	theme: RenderTheme;
}

function styleCliCommandOutputLine(options: StyleCliCommandOutputLineOptions): string {
	const { line, index, level, theme } = options;
	if (line === "") return line;
	if (level === "error" && index === 0) return theme.fg("error", line);
	if (level === "warning" && index === 0) return theme.fg("warning", line);
	if (level === "error" && isOutputSectionLabel(line)) return theme.fg("warning", line);
	return theme.fg("text", line);
}

function isOutputSectionLabel(line: string): boolean {
	return line === "stdout:" || line === "stderr:";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function assertValidCommandSpec(spec: CliCommandExtensionSpec): void {
	if (spec.cliName.trim() === "") {
		throw new Error("CLI command extension requires a non-empty cliName.");
	}
	if (spec.piNamespace.trim() === "") {
		throw new Error(`CLI command extension for ${spec.cliName} requires a non-empty piNamespace.`);
	}
	const seenNames = new Set<string>();
	const seenPiCommandNames = new Set<string>();
	for (const command of spec.commands) {
		if (command.name.trim() === "") {
			throw new Error(`CLI command extension for ${spec.cliName} includes an empty command name.`);
		}
		if (seenNames.has(command.name)) {
			throw new Error(`Duplicate ${spec.cliName} command name: ${command.name}`);
		}
		seenNames.add(command.name);

		const piCommandName = resolvePiCommandName(spec, command);
		if (piCommandName.trim() === "") {
			throw new Error(
				`CLI command extension for ${spec.cliName} resolved an empty Pi command name for ${command.name}.`,
			);
		}
		if (seenPiCommandNames.has(piCommandName)) {
			throw new Error(`Duplicate ${spec.cliName} Pi command name: ${piCommandName}`);
		}
		seenPiCommandNames.add(piCommandName);
	}
}
