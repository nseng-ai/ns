import { runChildSession, type ChildSessionPi, type ChildSessionResult } from "./run-child-session.ts";

export const RUN_CHILD_SESSION_TEXT_TOOL_NAME = "run_child_session_text";
export const MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS = 48_000;

type TextContent = { type: "text"; text: string };

export type ToolResult = {
	content: TextContent[];
	details?: unknown;
};

export type RunChildSessionTextInput = {
	title: string;
	prompt: string;
};

export type RunChildSessionTextDetails = {
	status: ChildSessionResult["status"];
	title?: string;
	elapsedMs: number;
	sessionFile?: string;
	progress: ChildSessionResult["progress"];
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
		params: RunChildSessionTextInput,
		signal: AbortSignal | undefined,
		onUpdate: ((partial: ToolResult) => void) | undefined,
		ctx: ExtensionContext,
	): Promise<ToolResult>;
};

export type ExtensionAPI = ChildSessionPi & {
	registerTool(tool: ToolDefinition): void;
};

export const RUN_CHILD_SESSION_TEXT_PARAMETERS = {
	type: "object",
	properties: {
		title: {
			type: "string",
			description: "Concise title for the child session artifact/progress.",
		},
		prompt: {
			type: "string",
			description: "Complete prompt for the child, including all necessary context.",
		},
	},
	required: ["title", "prompt"],
	additionalProperties: false,
} as const;

export default function runChildSessionTextExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: RUN_CHILD_SESSION_TEXT_TOOL_NAME,
		label: "Run Child Session Text",
		description: "Launch a focused child Pi session in the current cwd and return its final assistant text/status evidence.",
		promptSnippet: "Launch a focused child Pi session in the current cwd and return final assistant text",
		promptGuidelines: [
			"Use run_child_session_text only for a focused delegated task where the child prompt includes all necessary context.",
			"Use run_child_session_text sequentially in a shared worktree; inspect the returned status and sessionFile before deciding that work is complete.",
			"Do not treat non-final-text statuses from run_child_session_text as completion; inspect diagnostics and the child session file first.",
		],
		parameters: RUN_CHILD_SESSION_TEXT_PARAMETERS,
		execute: async (_toolCallId, params, signal, onUpdate, ctx) => {
			const input = validateRunChildSessionTextInput(params);
			onUpdate?.({
				content: [{ type: "text", text: `Launching child session: ${input.title}` }],
				details: { status: "starting", title: input.title },
			});

			const result = await runChildSession(pi, { cwd: ctx.cwd, ...(signal === undefined ? {} : { signal }) }, {
				title: input.title,
				prompt: input.prompt,
				returnMode: "final-text",
			});

			return {
				content: [{ type: "text", text: formatRunChildSessionTextResult(result) }],
				details: runChildSessionTextDetails(result),
			};
		},
	});
}

export function formatRunChildSessionTextResult(result: ChildSessionResult): string {
	const sessionFile = result.sessionFile ?? result.progress.sessionFile;
	const lines = [
		"run_child_session_text result",
		`Status: ${result.status}`,
		`Title: ${result.title ?? result.progress.title ?? "(untitled child session)"}`,
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
				`[Final text truncated to ${MAX_MODEL_VISIBLE_FINAL_TEXT_CHARS} of ${finalText.originalChars} characters. Full text available in child session file: ${sessionFile ?? "(not available)"}.]`,
			);
		}
		return lines.join("\n");
	}

	const diagnostic = resultDiagnostic(result);
	if (diagnostic !== undefined) lines.push(`Diagnostic: ${diagnostic}`);
	lines.push("", "The child did not produce usable final text. Inspect the session file before treating this delegated task as complete.");
	return lines.join("\n");
}

export function runChildSessionTextDetails(result: ChildSessionResult): RunChildSessionTextDetails {
	const title = result.title ?? result.progress.title;
	const sessionFile = result.sessionFile ?? result.progress.sessionFile;
	const details: RunChildSessionTextDetails = {
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

export function resultDiagnostic(result: ChildSessionResult): string | undefined {
	switch (result.status) {
		case "completed":
			return "Child Pi completed with a terminal capture instead of final assistant text.";
		case "blocked":
			return "Child Pi blocked with a terminal capture instead of final assistant text.";
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

function validateRunChildSessionTextInput(params: RunChildSessionTextInput): RunChildSessionTextInput {
	if (typeof params.title !== "string" || params.title.trim().length === 0) {
		throw new Error("run_child_session_text requires a non-empty title string.");
	}
	if (typeof params.prompt !== "string" || params.prompt.trim().length === 0) {
		throw new Error("run_child_session_text requires a non-empty prompt string.");
	}
	return { title: params.title.trim(), prompt: params.prompt };
}

function formatProgressLine(result: ChildSessionResult): string {
	const currentTool = result.progress.currentTool === undefined ? "" : `; current tool: ${result.progress.currentTool}`;
	return `Elapsed: ${formatElapsed(result.elapsedMs)}; turns: ${result.progress.turnCount}; tools: ${result.progress.toolCount}${currentTool}`;
}

function readStopReason(result: ChildSessionResult): string | undefined {
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
