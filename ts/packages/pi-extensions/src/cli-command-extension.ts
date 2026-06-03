import { appendFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";

import { customMessageText, truncateDisplayLine, type CustomMessageContent } from "./terminal-presentation.ts";

const CLI_COMMAND_BRIDGE_VERSION = "above-editor-live-stream-trace-v3";
const TRACE_ENV = "ASDL_PI_CLI_TRACE";
const TRACE_OUTPUT_ENV = "ASDL_PI_CLI_TRACE_OUTPUT";
const TRACE_PATH_ENV = "ASDL_PI_CLI_TRACE_PATH";
const DEFAULT_TRACE_FILENAME = "asdl-pi-cli-command-extension.jsonl";
const TRACE_OUTPUT_PREVIEW_CHARS = 500;
const LIVE_PROGRESS_STATUS_ID = "asdl-cli-command";
const LIVE_PROGRESS_WIDGET_ID = "asdl-cli-command-output";
const LIVE_PROGRESS_INTERVAL_MS = 1_000;
const LIVE_PROGRESS_MAX_LINES = 8;
const LIVE_PROGRESS_MAX_LINE_CHARS = 160;

export const CLI_COMMAND_OUTPUT_MESSAGE_TYPE = "asdl-cli-command-output";

type NotifyLevel = "info" | "warning" | "error";
type TraceFields = Record<string, unknown>;
type OutputStreamName = "stdout" | "stderr";
type LiveProgressTarget = "none" | "status" | "widget" | "status_widget";
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

type MessageRenderer = (message: CustomMessage, options: { expanded: boolean }, theme: RenderTheme) => RenderComponent;

export interface CliCommandInfo {
	name: string;
	description: string;
	canAcceptPositionalArgs?: boolean;
}

export type CliCommandConfirmPrompt = (title: string, message: string) => Promise<boolean> | boolean;

export interface CliCommandRunDeps {
	cwd: string;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	env: Record<string, string | undefined>;
	onOutput?: (stream: OutputStreamName, text: string) => void;
	confirm?: CliCommandConfirmPrompt;
}

export interface CliCommandExtensionSpec {
	cliName: string;
	piNamespace: string;
	commands: readonly CliCommandInfo[];
	runCli(args: readonly string[], deps: CliCommandRunDeps): Promise<number> | number;
	env?: Record<string, string | undefined>;
}

export interface CommandContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		confirm?(title: string, message: string): Promise<boolean> | boolean;
		setEditorText?(text: string): void;
		setStatus?(key: string, value: string | undefined): void;
		setWidget?(key: string, value: string[] | undefined, options?: { placement?: CommandWidgetPlacement }): void;
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
	sendMessage?(message: CustomMessage): void;
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
	level: "info" | "warning" | "error";
}

export function registerCliCommandExtension(pi: ExtensionAPI, spec: CliCommandExtensionSpec): void {
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
	pi: ExtensionAPI;
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
		const restored = restoreCommandInvocationToEditor({ ctx, piCommandName, rawArgs, reason: `Could not parse /${piCommandName}: ${parsed.error}` });
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

	if (startsWithPositionalArgs(parsed.args) && command.canAcceptPositionalArgs !== true) {
		const restored = restoreCommandInvocationToEditor({
			ctx,
			piCommandName,
			rawArgs,
			reason: `Not running /${piCommandName}: text after the command looks like prose, not options.`,
		});
		traceCliCommand("positional_args_rejected", {
			args: parsed.args,
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

	let stdout = "";
	let stderr = "";
	let hasLiveOutput = false;
	let exitCode = 1;
	const argv = [command.name, ...parsed.args];
	const progress = new LiveCommandProgress(ctx, {
		argv,
		cliName: spec.cliName,
		commandName: command.name,
		piCommandName,
	});
	try {
		progress.setPhase("waiting for Pi idle");
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
			runDeps.confirm = async (title, message) => {
				progress.setPhase("waiting for confirmation");
				try {
					return await confirm(title, message);
				} finally {
					progress.setPhase("running CLI command");
				}
			};
		}
		try {
			exitCode = await spec.runCli(argv, runDeps);
		} catch (error) {
			const message = errorMessage(error);
			const exceptionOutput = `Unhandled ${spec.cliName} command error: ${message}\n`;
			traceCliCommand("runner_exception", { commandName: command.name, error: message, piCommandName });
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
		const restored = restoreCommandInvocationToEditor({ ctx, piCommandName, rawArgs, reason: `Restored /${piCommandName} after a CLI usage error.` });
		traceCliCommand("usage_error_restored", { commandName: command.name, piCommandName, restored });
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

interface LiveCommandProgressOptions {
	cliName: string;
	commandName: string;
	piCommandName: string;
	argv: readonly string[];
}

interface LiveOutputLine {
	stream: OutputStreamName;
	text: string;
}

class LiveCommandProgress {
	private readonly ctx: CommandContext;
	private readonly options: LiveCommandProgressOptions;
	private readonly startedAt = Date.now();
	private readonly target: LiveProgressTarget;
	private phase = "starting";
	private stdoutChars = 0;
	private stderrChars = 0;
	private stdoutPending = "";
	private stderrPending = "";
	private outputLines: LiveOutputLine[] = [];
	private timer: ReturnType<typeof setInterval> | undefined;
	private isClosed = false;

	constructor(ctx: CommandContext, options: LiveCommandProgressOptions) {
		this.ctx = ctx;
		this.options = options;
		this.target = liveProgressTarget(ctx);
		traceCliCommand("live_progress_start", {
			commandName: options.commandName,
			piCommandName: options.piCommandName,
			sendMessageCalled: false,
			target: this.target,
		});

		if (this.target === "none") return;

		this.render();
		this.timer = setInterval(() => {
			this.render();
		}, LIVE_PROGRESS_INTERVAL_MS);
	}

	setPhase(phase: string): void {
		this.phase = phase;
		this.render();
	}

	appendOutput(stream: OutputStreamName, text: string): void {
		if (text === "") return;

		if (stream === "stdout") {
			this.stdoutChars += text.length;
		} else {
			this.stderrChars += text.length;
		}
		this.recordOutput(stream, text);
		traceCliCommand("live_progress_output", {
			chunkChars: text.length,
			commandName: this.options.commandName,
			piCommandName: this.options.piCommandName,
			sendMessageCalled: false,
			stderrChars: this.stderrChars,
			stdoutChars: this.stdoutChars,
			stream,
			target: this.target,
		});
		this.render();
	}

	close(): void {
		if (this.isClosed) return;
		this.isClosed = true;
		if (this.timer !== undefined) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
		if (this.target !== "none") {
			this.ctx.ui.setStatus?.(LIVE_PROGRESS_STATUS_ID, undefined);
			this.ctx.ui.setWidget?.(LIVE_PROGRESS_WIDGET_ID, undefined);
		}
		traceCliCommand("live_progress_stop", {
			commandName: this.options.commandName,
			elapsedMs: Date.now() - this.startedAt,
			piCommandName: this.options.piCommandName,
			sendMessageCalled: false,
			stderrChars: this.stderrChars,
			stdoutChars: this.stdoutChars,
			target: this.target,
		});
	}

	private render(): void {
		if (this.target === "none" || this.isClosed) return;

		const elapsed = formatElapsedMs(Date.now() - this.startedAt);
		this.ctx.ui.setStatus?.(LIVE_PROGRESS_STATUS_ID, `/${this.options.piCommandName} ${this.phase} (${elapsed})`);
		this.ctx.ui.setWidget?.(LIVE_PROGRESS_WIDGET_ID, this.widgetLines(elapsed), { placement: "aboveEditor" });
	}

	private widgetLines(elapsed: string): string[] {
		const lines = [
			`Running /${this.options.piCommandName} — ${this.phase} — ${elapsed} elapsed`,
			`$ ${formatCommandForDisplay(this.options.cliName, this.options.argv)}`,
			`stdout ${this.stdoutChars} chars, stderr ${this.stderrChars} chars`,
		];
		const recentLines = this.recentOutputLines();
		if (recentLines.length === 0) {
			lines.push("No CLI output yet; still running.");
			return lines;
		}

		lines.push("Recent CLI output:");
		for (const line of recentLines) {
			lines.push(formatLiveOutputLine(line));
		}
		return lines;
	}

	private recordOutput(stream: OutputStreamName, text: string): void {
		const pending = stream === "stdout" ? this.stdoutPending : this.stderrPending;
		const parts = `${pending}${text.replace(/\r/g, "\n")}`.split("\n");
		const nextPending = parts.pop() ?? "";
		for (const line of parts) {
			this.outputLines.push({ stream, text: line });
		}
		if (stream === "stdout") {
			this.stdoutPending = nextPending;
		} else {
			this.stderrPending = nextPending;
		}
		this.outputLines = this.outputLines.slice(-LIVE_PROGRESS_MAX_LINES);
	}

	private recentOutputLines(): LiveOutputLine[] {
		const lines = [...this.outputLines];
		if (this.stdoutPending !== "") {
			lines.push({ stream: "stdout", text: this.stdoutPending });
		}
		if (this.stderrPending !== "") {
			lines.push({ stream: "stderr", text: this.stderrPending });
		}
		return lines.slice(-LIVE_PROGRESS_MAX_LINES);
	}
}

function liveProgressTarget(ctx: CommandContext): LiveProgressTarget {
	if (!ctx.hasUI) return "none";

	const hasStatus = ctx.ui.setStatus !== undefined;
	const hasWidget = ctx.ui.setWidget !== undefined;
	if (hasStatus && hasWidget) return "status_widget";
	if (hasStatus) return "status";
	if (hasWidget) return "widget";
	return "none";
}

function formatCommandForDisplay(cliName: string, argv: readonly string[]): string {
	return [cliName, ...argv].map(formatDisplayArg).join(" ");
}

function formatDisplayArg(arg: string): string {
	if (/^[A-Za-z0-9_./:=@+-]+$/.test(arg)) return arg;
	return JSON.stringify(arg);
}

function formatLiveOutputLine(line: LiveOutputLine): string {
	return `${line.stream}: ${truncateLiveProgressLine(line.text)}`;
}

function truncateLiveProgressLine(text: string): string {
	if (text.length <= LIVE_PROGRESS_MAX_LINE_CHARS) return text;
	return `${text.slice(0, LIVE_PROGRESS_MAX_LINE_CHARS - 1)}…`;
}

function formatElapsedMs(elapsedMs: number): string {
	const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
	if (seconds < 60) return `${seconds}s`;

	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}m ${remainingSeconds}s`;
}

function emitCliCommandOutput(pi: ExtensionAPI, ctx: CommandContext, details: CliCommandOutputDetails): void {
	const displayText = formatCliCommandOutput(details);
	const sendMessage = pi.sendMessage;
	const canSendRenderedMessage = ctx.hasUI && sendMessage !== undefined && pi.registerMessageRenderer !== undefined;
	const target = canSendRenderedMessage ? "custom_message" : ctx.hasUI ? "notify" : details.level === "info" ? "stdout" : "stderr";
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
		sendMessage({
			customType: CLI_COMMAND_OUTPUT_MESSAGE_TYPE,
			content: displayText,
			display: true,
			details,
		});
		return;
	}
	if (ctx.hasUI) {
		ctx.ui.notify(displayText, details.level);
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

export function cliCommandTracePath(env: Record<string, string | undefined> = process.env): string {
	return env[TRACE_PATH_ENV] ?? join(tmpdir(), DEFAULT_TRACE_FILENAME);
}

function traceCliCommand(event: string, fields: TraceFields = {}): void {
	if (!isTraceEnabled(process.env)) return;

	const path = cliCommandTracePath(process.env);
	const record = {
		timestamp: new Date().toISOString(),
		pid: process.pid,
		version: CLI_COMMAND_BRIDGE_VERSION,
		event,
		...fields,
	};

	try {
		mkdirSync(dirname(path), { recursive: true });
		appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
	} catch {
		// Trace logging is diagnostic only and must never affect command execution.
	}
}

function isTraceEnabled(env: Record<string, string | undefined>): boolean {
	const value = env[TRACE_ENV]?.toLowerCase();
	return value !== "0" && value !== "false" && value !== "off";
}

function outputTraceFields(stdout: string, stderr: string): TraceFields {
	const fields: TraceFields = {
		stderrChars: stderr.length,
		stdoutChars: stdout.length,
	};
	if (process.env[TRACE_OUTPUT_ENV] === "1") {
		fields.stdoutPreview = tracePreview(stdout);
		fields.stderrPreview = tracePreview(stderr);
	}
	return fields;
}

function tracePreview(text: string): string {
	if (text.length <= TRACE_OUTPUT_PREVIEW_CHARS) return text;
	return `${text.slice(0, TRACE_OUTPUT_PREVIEW_CHARS)}…`;
}

function hasSendMessage(pi: ExtensionAPI): boolean {
	return typeof pi.sendMessage === "function";
}

function hasMessageRenderer(pi: ExtensionAPI): boolean {
	return typeof pi.registerMessageRenderer === "function";
}

function cliCommandMessageLevel(details: unknown): "info" | "warning" | "error" {
	if (isRecord(details) && details.level === "error") return "error";
	if (isRecord(details) && details.level === "warning") return "warning";
	return "info";
}

interface StyleCliCommandOutputLineOptions {
	line: string;
	index: number;
	level: "info" | "warning" | "error";
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

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}
