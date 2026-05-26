import type { RunnerSubagentProgress } from "../runner-subagent.ts";

export const RUNNER_SUBAGENT_ACTIVITY_PREVIEW_CHARS = 240;

export type RunnerSubagentActivity = {
	assistantPreview?: string;
	currentToolInputPreview?: string;
	lastToolName?: string;
	lastToolResultPreview?: string;
	lastToolResultIsError?: boolean;
};

export type RunnerSubagentUpdate = {
	progress: RunnerSubagentProgress;
	activity: RunnerSubagentActivity;
};

export function emptyRunnerSubagentActivity(): RunnerSubagentActivity {
	return {};
}

export function previewJsonEventValue(value: unknown, limit = RUNNER_SUBAGENT_ACTIVITY_PREVIEW_CHARS): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "string") return nonEmptyCompactPreview(value, limit);

	let serialized: string | undefined;
	try {
		serialized = JSON.stringify(value, createSafeJsonReplacer());
	} catch {
		serialized = String(value);
	}

	serialized ??= String(value);
	return nonEmptyCompactPreview(serialized, limit);
}

export function compactPreviewText(text: string, limit = RUNNER_SUBAGENT_ACTIVITY_PREVIEW_CHARS): string {
	const compacted = text.replace(/\s+/g, " ").trim();
	if (limit <= 0) return "";
	if (compacted.length <= limit) return compacted;
	if (limit === 1) return "…";
	return `${compacted.slice(0, limit - 1)}…`;
}

export function assistantVisibleTextFromMessage(message: unknown): string | undefined {
	const text = rawAssistantVisibleTextFromMessage(message);
	return text === undefined ? undefined : nonEmptyCompactPreview(text);
}

export function toolInputPreviewFromEvent(event: Record<string, unknown>): string | undefined {
	for (const key of ["args", "arguments", "input"] as const) {
		if (Object.prototype.hasOwnProperty.call(event, key)) {
			return previewJsonEventValue(event[key]);
		}
	}
	return undefined;
}

export function toolResultPreviewFromEvent(event: Record<string, unknown>): string | undefined {
	if (!Object.prototype.hasOwnProperty.call(event, "result")) return undefined;
	const result = event.result;
	const contentText = toolResultTextContent(result);
	if (contentText !== undefined) {
		const preview = nonEmptyCompactPreview(contentText);
		if (preview !== undefined) return preview;
	}
	return previewJsonEventValue(result);
}

function rawAssistantVisibleTextFromMessage(message: unknown): string | undefined {
	if (!isRecord(message) || message.role !== "assistant") return undefined;
	if (!Array.isArray(message.content)) return undefined;
	const textBlocks: string[] = [];
	for (const block of message.content) {
		if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") continue;
		textBlocks.push(block.text);
	}
	const text = textBlocks.join("\n\n").trim();
	return text.length > 0 ? text : undefined;
}

function toolResultTextContent(value: unknown): string | undefined {
	if (!isRecord(value) || !Array.isArray(value.content)) return undefined;
	const textBlocks: string[] = [];
	for (const block of value.content) {
		if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") continue;
		textBlocks.push(block.text);
	}
	return textBlocks.length === 0 ? undefined : textBlocks.join("\n\n");
}

function nonEmptyCompactPreview(text: string, limit = RUNNER_SUBAGENT_ACTIVITY_PREVIEW_CHARS): string | undefined {
	const preview = compactPreviewText(text, limit);
	return preview.length > 0 ? preview : undefined;
}

function createSafeJsonReplacer(): (key: string, value: unknown) => unknown {
	const seen = new WeakSet<object>();
	return (_key: string, value: unknown): unknown => {
		if (typeof value === "bigint") return `${value.toString()}n`;
		if (typeof value !== "object" || value === null) return value;
		if (seen.has(value)) return "[Circular]";
		seen.add(value);
		return value;
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
