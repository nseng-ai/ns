import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import { stripTerminalEscapes } from "@nseng-ai/foundation/terminal-escapes";

export const CLI_COMMAND_RESULT_PROMPT_OUTPUT_MAX_CHARS = 40_000;
export const CLI_COMMAND_RESULT_OMISSION_MARKER_PREFIX = "\n\n[output truncated; omitted ";

export interface CliCommandResultDetails {
	readonly cliName: string;
	readonly commandName: string;
	readonly argv: readonly string[];
	readonly cwd: string;
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

export interface CliCommandResultLogPaths {
	readonly stdoutPath: string;
	readonly stderrPath: string;
}

export type WriteCliCommandResultLogs = (
	output: Pick<CliCommandResultDetails, "stdout" | "stderr">,
) => Promise<
	| { readonly ok: true; readonly paths: CliCommandResultLogPaths }
	| { readonly ok: false; readonly message: string }
>;

export type SelectCliCommandResultModel = () => Promise<
	| { readonly ok: true; readonly modelSelection: ModelSelection }
	| { readonly ok: false; readonly message: string }
>;

export type GenerateCliCommandResultSummary = (request: {
	readonly modelSelection: ModelSelection;
	readonly prompt: string;
}) => Promise<
	{ readonly ok: true; readonly text: string } | { readonly ok: false; readonly message: string }
>;

export interface SummarizeCliCommandResultOptions {
	readonly details: CliCommandResultDetails;
	readonly rawFallbackMarkdown: string;
	readonly writeLogs: WriteCliCommandResultLogs;
	readonly selectModel: SelectCliCommandResultModel;
	readonly generateSummary: GenerateCliCommandResultSummary;
}

export type CliCommandResultSummaryResult =
	| {
			readonly type: "summarized";
			readonly markdown: string;
			readonly summaryMarkdown: string;
			readonly logPaths: CliCommandResultLogPaths;
			readonly modelSelection: ModelSelection;
	  }
	| {
			readonly type: "fallback";
			readonly markdown: string;
			readonly reason: "model-selection-failed" | "generation-failed" | "invalid-summary";
			readonly message: string;
			readonly logPaths: CliCommandResultLogPaths;
	  }
	| {
			readonly type: "log-unavailable";
			readonly markdown: string;
			readonly message: string;
	  };

export function buildCliCommandResultSummaryPrompt(details: CliCommandResultDetails): string {
	const expectedShape =
		details.exitCode === 0
			? "Return exactly `## Summary` followed by 1-4 `- ` bullet lines."
			: "Return exactly `## Summary` followed by 1-4 `- ` bullet lines, then `## Errors` followed by 1-4 `- ` bullet lines.";
	const output = truncateCombinedOutput(
		`<stdout>\n${sanitizeTerminalControlText(details.stdout)}\n</stdout>\n<stderr>\n${sanitizeTerminalControlText(details.stderr)}\n</stderr>`,
	);
	return [
		"Summarize this CLI command result for a software engineer.",
		expectedShape,
		"Use concise, factual, single-line bullets. Do not add prose, code fences, or other headings.",
		`Command: ${sanitizeTerminalControlText(details.cliName)} ${sanitizeTerminalControlText(details.commandName)}`,
		`Arguments: ${JSON.stringify(details.argv.map(sanitizeTerminalControlText))}`,
		`Working directory: ${sanitizeTerminalControlText(details.cwd)}`,
		`Exit code: ${details.exitCode}`,
		output,
	].join("\n\n");
}

export function validateCliCommandResultSummary(
	text: string,
	exitCode: number,
): { readonly ok: true; readonly markdown: string } | { readonly ok: false } {
	const markdown = sanitizeTerminalControlText(text).trim();
	if (markdown !== text.trim()) return { ok: false };
	const lines = markdown.split("\n");
	let index = 0;
	if (lines[index] !== "## Summary") return { ok: false };
	index += 1;
	const summary = consumeBullets(lines, index);
	if (summary.count < 1 || summary.count > 4) return { ok: false };
	index = summary.nextIndex;

	if (exitCode === 0) {
		return index === lines.length ? { ok: true, markdown } : { ok: false };
	}
	if (lines[index] !== "## Errors") return { ok: false };
	const errors = consumeBullets(lines, index + 1);
	if (errors.count < 1 || errors.count > 4 || errors.nextIndex !== lines.length) {
		return { ok: false };
	}
	return { ok: true, markdown };
}

export function renderCliCommandResultSummary(options: {
	readonly summaryMarkdown: string;
	readonly logPaths: CliCommandResultLogPaths;
}): string {
	return `${options.summaryMarkdown}\n\n## Raw logs\n- stdout: ${sanitizeTerminalControlText(options.logPaths.stdoutPath)}\n- stderr: ${sanitizeTerminalControlText(options.logPaths.stderrPath)}`;
}

export async function summarizeCliCommandResult(
	options: SummarizeCliCommandResultOptions,
): Promise<CliCommandResultSummaryResult> {
	let logs: Awaited<ReturnType<WriteCliCommandResultLogs>>;
	try {
		logs = await options.writeLogs({
			stdout: options.details.stdout,
			stderr: options.details.stderr,
		});
	} catch (error) {
		return logUnavailable(options, errorMessage(error));
	}
	if (!logs.ok) return logUnavailable(options, logs.message);

	let selected: Awaited<ReturnType<SelectCliCommandResultModel>>;
	try {
		selected = await options.selectModel();
	} catch (error) {
		return fallback(options, logs.paths, "model-selection-failed", errorMessage(error));
	}
	if (!selected.ok) {
		return fallback(options, logs.paths, "model-selection-failed", selected.message);
	}

	let generated: Awaited<ReturnType<GenerateCliCommandResultSummary>>;
	try {
		generated = await options.generateSummary({
			modelSelection: selected.modelSelection,
			prompt: buildCliCommandResultSummaryPrompt(options.details),
		});
	} catch (error) {
		return fallback(options, logs.paths, "generation-failed", errorMessage(error));
	}
	if (!generated.ok) {
		return fallback(options, logs.paths, "generation-failed", generated.message);
	}
	const validated = validateCliCommandResultSummary(generated.text, options.details.exitCode);
	if (!validated.ok) {
		return fallback(
			options,
			logs.paths,
			"invalid-summary",
			"The generated summary did not match the required Markdown shape.",
		);
	}
	return {
		type: "summarized",
		markdown: renderCliCommandResultSummary({
			summaryMarkdown: validated.markdown,
			logPaths: logs.paths,
		}),
		summaryMarkdown: validated.markdown,
		logPaths: logs.paths,
		modelSelection: selected.modelSelection,
	};
}

export function sanitizeTerminalControlText(text: string): string {
	return stripTerminalEscapes(text)
		.replace(/\r\n?/g, "\n")
		.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

function truncateCombinedOutput(output: string): string {
	if (output.length <= CLI_COMMAND_RESULT_PROMPT_OUTPUT_MAX_CHARS) return output;
	let omittedChars = output.length - CLI_COMMAND_RESULT_PROMPT_OUTPUT_MAX_CHARS;
	let marker = buildOmissionMarker(omittedChars);
	let retainedChars = CLI_COMMAND_RESULT_PROMPT_OUTPUT_MAX_CHARS - marker.length;
	omittedChars = output.length - retainedChars;
	marker = buildOmissionMarker(omittedChars);
	retainedChars = CLI_COMMAND_RESULT_PROMPT_OUTPUT_MAX_CHARS - marker.length;
	return `${output.slice(0, retainedChars)}${marker}`;
}

function buildOmissionMarker(omittedChars: number): string {
	return `${CLI_COMMAND_RESULT_OMISSION_MARKER_PREFIX}${omittedChars} characters]\n`;
}

function consumeBullets(
	lines: readonly string[],
	startIndex: number,
): { readonly count: number; readonly nextIndex: number } {
	let index = startIndex;
	while (index < lines.length && /^- \S.*$/.test(lines[index] ?? "")) index += 1;
	return { count: index - startIndex, nextIndex: index };
}

function fallback(
	details: SummarizeCliCommandResultOptions,
	logPaths: CliCommandResultLogPaths,
	reason: "model-selection-failed" | "generation-failed" | "invalid-summary",
	message: string,
): CliCommandResultSummaryResult {
	return {
		type: "fallback",
		markdown: renderRawFallback(details.rawFallbackMarkdown, logPaths),
		reason,
		message: sanitizeTerminalControlText(message),
		logPaths,
	};
}

function logUnavailable(
	options: SummarizeCliCommandResultOptions,
	message: string,
): CliCommandResultSummaryResult {
	return {
		type: "log-unavailable",
		markdown: `${options.rawFallbackMarkdown}\n\nRaw command logs are unavailable: ${sanitizeTerminalControlText(message)}`,
		message: sanitizeTerminalControlText(message),
	};
}

function renderRawFallback(
	rawFallbackMarkdown: string,
	logPaths: CliCommandResultLogPaths,
): string {
	return `${rawFallbackMarkdown}\n\nRaw logs:\nstdout: ${sanitizeTerminalControlText(logPaths.stdoutPath)}\nstderr: ${sanitizeTerminalControlText(logPaths.stderrPath)}`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
