import { isRecord } from "../cmux/primitives.ts";

export function extractRunnerSubagentToolCallPayloadsFromSessionJsonl(
	jsonl: string,
	toolName: string,
): unknown[] {
	const payloads: unknown[] = [];
	for (const line of jsonl.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		let value: unknown;
		try {
			value = JSON.parse(trimmed);
		} catch {
			// Session JSONL may be read while Pi is appending; recovery ignores partial lines.
			continue;
		}
		collectRunnerSubagentToolCallPayloads(value, toolName, payloads);
	}
	return payloads;
}

function collectRunnerSubagentToolCallPayloads(
	value: unknown,
	toolName: string,
	payloads: unknown[],
): void {
	if (Array.isArray(value)) {
		for (const item of value) collectRunnerSubagentToolCallPayloads(item, toolName, payloads);
		return;
	}
	if (!isRecord(value)) return;
	if (value.type === "toolCall" && value.name === toolName && "arguments" in value) {
		payloads.push(value.arguments);
	}
	for (const child of Object.values(value)) {
		collectRunnerSubagentToolCallPayloads(child, toolName, payloads);
	}
}
