import { type ExecResult, formatOutputSection, tailText } from "@sdl/exec";

const DEFAULT_COMMAND_OUTPUT_TAIL_OPTIONS = { maxChars: 4_000, maxLines: 30 } as const;

export interface CommandOutputFormatOptions {
	maxChars?: number;
	maxLines?: number;
}

export interface NotifiableCommandContext {
	hasUI?: boolean;
	ui: {
		notify(message: string, level?: "info" | "warning" | "error"): void;
	};
}

export function formatCommandOutput(
	result: ExecResult,
	options: CommandOutputFormatOptions = {},
): string {
	const tailOptions = {
		maxChars: options.maxChars ?? DEFAULT_COMMAND_OUTPUT_TAIL_OPTIONS.maxChars,
		maxLines: options.maxLines ?? DEFAULT_COMMAND_OUTPUT_TAIL_OPTIONS.maxLines,
	};
	const parts: string[] = [];
	if (result.stdout.trim().length > 0)
		parts.push(formatOutputSection("stdout", result.stdout, tailOptions));
	if (result.stderr.trim().length > 0)
		parts.push(formatOutputSection("stderr", result.stderr, tailOptions));
	if (result.startupError !== undefined && result.startupError.length > 0) {
		parts.push(`startup error:\n${tailText(result.startupError.trimEnd(), tailOptions)}`);
	}
	return parts.join("\n\n");
}

export function notifyCommandUi(
	ctx: NotifiableCommandContext,
	message: string,
	level: "info" | "warning" | "error",
): void {
	if (ctx.hasUI !== false) ctx.ui.notify(message, level);
}
