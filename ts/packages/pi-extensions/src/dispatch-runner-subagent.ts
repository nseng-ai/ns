import { dispatchRunnerSubagent, type RunnerSubagentPi, type RunnerSubagentResult } from "./runner-subagent.ts";

export const DISPATCH_RUNNER_SUBAGENT_TOOL_NAME = "dispatch_runner_subagent";
export const MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS = 48_000;

type TextContent = { type: "text"; text: string };

export type ToolResult = {
	content: TextContent[];
	details?: unknown;
};

export type DispatchRunnerSubagentInput = {
	title: string;
	prompt: string;
};

export type DispatchRunnerSubagentDetails = {
	status: RunnerSubagentResult["status"];
	title?: string;
	elapsedMs: number;
	sessionFile?: string;
	progress: RunnerSubagentResult["progress"];
	finalTextChars?: number;
	finalTextTruncated?: boolean;
	diagnostic?: string;
	stopReason?: string;
	error?: unknown;
	protocolError?: unknown;
};

export type ExtensionContext = {
	cwd: string;
};

export type ToolDefinition = {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: object;
	execute(
		toolCallId: string,
		params: DispatchRunnerSubagentInput,
		signal: AbortSignal | undefined,
		onUpdate: ((partial: ToolResult) => void) | undefined,
		ctx: ExtensionContext,
	): Promise<ToolResult>;
};

export type ExtensionAPI = RunnerSubagentPi & {
	registerTool(tool: ToolDefinition): void;
};

export const DISPATCH_RUNNER_SUBAGENT_PARAMETERS = {
	type: "object",
	properties: {
		title: {
			type: "string",
			description: "Concise title for the runner subagent artifact/progress.",
		},
		prompt: {
			type: "string",
			description: "Complete prompt for the subagent, including all necessary context.",
		},
	},
	required: ["title", "prompt"],
	additionalProperties: false,
} as const;

export default function dispatchRunnerSubagentExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: DISPATCH_RUNNER_SUBAGENT_TOOL_NAME,
		label: "Dispatch Runner Subagent",
		description: "Launch a focused subagent Pi session in the current cwd and return its final assistant text/status evidence.",
		promptSnippet: "Launch a focused subagent Pi session in the current cwd and return final assistant text",
		promptGuidelines: [
			"Use dispatch_runner_subagent only for a focused delegated task where the subagent prompt includes all necessary context.",
			"Use dispatch_runner_subagent sequentially in a shared worktree; inspect the returned status and sessionFile before deciding that work is complete.",
			"Do not treat non-final-text statuses from dispatch_runner_subagent as completion; inspect diagnostics and the subagent session file first.",
		],
		parameters: DISPATCH_RUNNER_SUBAGENT_PARAMETERS,
		execute: async (_toolCallId, params, signal, onUpdate, ctx) => {
			const input = validateDispatchRunnerSubagentInput(params);
			onUpdate?.({
				content: [{ type: "text", text: `Dispatching subagent: ${input.title}` }],
				details: { status: "starting", title: input.title },
			});

			const result = await dispatchRunnerSubagent(pi, { cwd: ctx.cwd, ...(signal === undefined ? {} : { signal }) }, {
				title: input.title,
				prompt: input.prompt,
				returnMode: "final-text",
			});

			return {
				content: [{ type: "text", text: formatDispatchRunnerSubagentResult(result) }],
				details: dispatchRunnerSubagentDetails(result),
			};
		},
	});
}

export function formatDispatchRunnerSubagentResult(result: RunnerSubagentResult): string {
	const sessionFile = result.sessionFile ?? result.progress.sessionFile;
	const lines = [
		"dispatch_runner_subagent result",
		`Status: ${result.status}`,
		`Title: ${result.title ?? result.progress.title ?? "(untitled subagent session)"}`,
		`Session file: ${sessionFile ?? "(not available)"}`,
		formatProgressLine(result),
	];
	const stopReason = readStopReason(result);
	if (stopReason !== undefined) lines.push(`Stop reason: ${stopReason}`);

	if (result.status === "final-text") {
		const finalText = truncateFinalTextForToolContent(result.finalText);
		lines.push("", "Final text:", finalText.text);
		if (finalText.truncated) {
			lines.push(
				"",
				`[Final text truncated to ${MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS} of ${finalText.originalChars} characters. Full text available in subagent session file: ${sessionFile ?? "(not available)"}.]`,
			);
		}
		return lines.join("\n");
	}

	const diagnostic = resultDiagnostic(result);
	if (diagnostic !== undefined) lines.push(`Diagnostic: ${diagnostic}`);
	lines.push("", "The subagent did not produce usable final text. Inspect the session file before treating this delegated task as complete.");
	return lines.join("\n");
}

export function dispatchRunnerSubagentDetails(result: RunnerSubagentResult): DispatchRunnerSubagentDetails {
	const title = result.title ?? result.progress.title;
	const sessionFile = result.sessionFile ?? result.progress.sessionFile;
	const details: DispatchRunnerSubagentDetails = {
		status: result.status,
		...(title === undefined ? {} : { title }),
		elapsedMs: result.elapsedMs,
		...(sessionFile === undefined ? {} : { sessionFile }),
		progress: result.progress,
	};

	switch (result.status) {
		case "completed":
		case "blocked": {
			const diagnostic = resultDiagnostic(result);
			if (diagnostic !== undefined) details.diagnostic = diagnostic;
			break;
		}
		case "final-text": {
			const finalText = truncateFinalTextForToolContent(result.finalText);
			details.finalTextChars = finalText.originalChars;
			details.finalTextTruncated = finalText.truncated;
			if (result.stopReason !== undefined) details.stopReason = result.stopReason;
			break;
		}
		case "stopped-without-terminal":
		case "stopped-without-useful-text":
			details.diagnostic = result.diagnostic;
			if (result.stopReason !== undefined) details.stopReason = result.stopReason;
			break;
		case "cancelled":
			details.diagnostic = result.diagnostic;
			break;
		case "error":
			details.diagnostic = result.diagnostic;
			details.error = result.error;
			break;
		case "protocol-error":
			details.diagnostic = result.diagnostic;
			details.protocolError = result.protocolError;
			break;
		default: {
			const exhaustive: never = result;
			return exhaustive;
		}
	}

	return details;
}

export function truncateFinalTextForToolContent(text: string): { text: string; truncated: boolean; originalChars: number } {
	const originalChars = text.length;
	if (originalChars <= MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS) {
		return { text, truncated: false, originalChars };
	}
	return {
		text: text.slice(0, MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS),
		truncated: true,
		originalChars,
	};
}

export function formatElapsed(elapsedMs: number): string {
	if (elapsedMs < 1_000) return `${elapsedMs}ms`;
	return `${(elapsedMs / 1_000).toFixed(1)}s`;
}

export function resultDiagnostic(result: RunnerSubagentResult): string | undefined {
	switch (result.status) {
		case "completed":
			return "Subagent Pi completed with a terminal capture instead of final assistant text.";
		case "blocked":
			return "Subagent Pi blocked with a terminal capture instead of final assistant text.";
		case "final-text":
			return undefined;
		case "stopped-without-terminal":
		case "stopped-without-useful-text":
		case "cancelled":
		case "error":
		case "protocol-error":
			return result.diagnostic;
		default: {
			const exhaustive: never = result;
			return exhaustive;
		}
	}
}

function validateDispatchRunnerSubagentInput(params: DispatchRunnerSubagentInput): DispatchRunnerSubagentInput {
	if (typeof params.title !== "string" || params.title.trim().length === 0) {
		throw new Error("dispatch_runner_subagent requires a non-empty title string.");
	}
	if (typeof params.prompt !== "string" || params.prompt.trim().length === 0) {
		throw new Error("dispatch_runner_subagent requires a non-empty prompt string.");
	}
	return { title: params.title.trim(), prompt: params.prompt };
}

function formatProgressLine(result: RunnerSubagentResult): string {
	const currentTool = result.progress.currentTool === undefined ? "" : `; current tool: ${result.progress.currentTool}`;
	return `Elapsed: ${formatElapsed(result.elapsedMs)}; turns: ${result.progress.turnCount}; tools: ${result.progress.toolCount}${currentTool}`;
}

function readStopReason(result: RunnerSubagentResult): string | undefined {
	switch (result.status) {
		case "completed":
		case "blocked":
		case "cancelled":
		case "error":
		case "protocol-error":
			return undefined;
		case "final-text":
		case "stopped-without-terminal":
		case "stopped-without-useful-text":
			return result.stopReason;
		default: {
			const exhaustive: never = result;
			return exhaustive;
		}
	}
}
