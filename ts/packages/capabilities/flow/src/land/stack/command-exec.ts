import {
	type ExecResult,
	formatCommandTermination,
	formatOutputSection,
	tailText,
} from "@nseng-ai/foundation/command";
import {
	MAX_COMMAND_STREAM_OUTPUT_LINES,
	MAX_OUTPUT_TAIL_CHARS,
	MAX_OUTPUT_TAIL_LINES,
} from "./constants.ts";
import { normalizeLandCommandFinish, stripAnsi } from "./graphite-command-channel.ts";
import type { LandStackExtensionAPI } from "./types.ts";

export interface ExecOptions {
	pi: LandStackExtensionAPI;
	command: string;
	args: string[];
	cwd: string;
	timeoutMs: number;
}

export async function exec(options: ExecOptions): Promise<ExecResult> {
	const result = await execRaw(options);
	return normalizeLandCommandFinish(options.command, options.args, result).result;
}

export async function execRaw(options: ExecOptions): Promise<ExecResult> {
	return await options.pi.exec(options.command, options.args, {
		cwd: options.cwd,
		timeout: options.timeoutMs,
	});
}

export function commandStreamOutputLines(result: ExecResult): string[] {
	const output = outputTail(stripAnsi(`${result.stderr}\n${result.stdout}`).replace(/\r/g, "\n"));
	if (!output) return [];
	return output
		.split("\n")
		.slice(-MAX_COMMAND_STREAM_OUTPUT_LINES)
		.map((line) => `  │ ${line}`);
}

export function formatCommandDetails(result: ExecResult, commandDisplay?: string): string {
	const lines: string[] = [];
	if (commandDisplay) {
		lines.push(`$ ${commandDisplay}`);
	}
	lines.push(formatCommandTermination(result));
	lines.push(
		formatOutputSection("stdout", result.stdout, {
			maxLines: MAX_OUTPUT_TAIL_LINES,
			maxChars: MAX_OUTPUT_TAIL_CHARS,
		}),
	);
	lines.push(
		formatOutputSection("stderr", result.stderr, {
			maxLines: MAX_OUTPUT_TAIL_LINES,
			maxChars: MAX_OUTPUT_TAIL_CHARS,
		}),
	);
	return lines.join("\n");
}

export function outputTail(output: string): string {
	const trimmed = output.trimEnd();
	if (!trimmed) return "";
	return tailText(trimmed, { maxLines: MAX_OUTPUT_TAIL_LINES, maxChars: MAX_OUTPUT_TAIL_CHARS });
}
