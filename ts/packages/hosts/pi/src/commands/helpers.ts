import { type ExecResult, formatOutputSection, tailText } from "@nseng-ai/foundation/exec";
import type { NotifyLevel } from "../runtime/tool-types.ts";

const DEFAULT_COMMAND_OUTPUT_TAIL_OPTIONS = { maxChars: 4_000, maxLines: 30 } as const;

export interface CommandOutputFormatOptions {
	maxChars?: number;
	maxLines?: number;
}

export interface NotifiableCommandContext {
	hasUI?: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
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
	if (result.type === "spawn-failed" && result.error.length > 0) {
		parts.push(`startup error:\n${tailText(result.error.trimEnd(), tailOptions)}`);
	}
	return parts.join("\n\n");
}

export function notifyCommandUi(
	ctx: NotifiableCommandContext,
	message: string,
	level: NotifyLevel,
): void {
	if (ctx.hasUI !== false) ctx.ui.notify(message, level);
}
