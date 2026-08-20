import { isAbsolute, relative, resolve, sep } from "node:path";

import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import {
	readRuntimeConfigFileSync,
	writeRuntimeResultFileSync,
	type RuntimeConfigV1,
	type RuntimeResultV1,
} from "./subagent-runtime.ts";

export interface RunnerSubagentRuntimeExtensionOptions {
	configPath: string;
	resultPath: string;
}

interface TextContent {
	type: "text";
	text: string;
}

interface AgentToolResult {
	content: TextContent[];
	details?: unknown;
	terminate?: boolean;
}

interface ExtensionContextLike {
	abort?: () => void;
}

interface BeforeAgentStartEventLike {
	systemPrompt: string;
}

interface ToolCallEventLike {
	toolName: string;
	input: unknown;
}

interface ToolCallResultLike {
	block: true;
	reason?: string;
}

interface ToolDefinitionLike {
	name: string;
	label: string;
	description: string;
	promptSnippet: string;
	promptGuidelines: string[];
	parameters: object;
	executionMode: "sequential";
	execute(
		toolCallId: string,
		params: unknown,
		signal: AbortSignal | undefined,
		onUpdate: unknown,
		ctx: ExtensionContextLike,
	): Promise<AgentToolResult>;
}

interface ExtensionApiLike {
	on(
		event: "session_start",
		handler: (event: unknown, ctx: ExtensionContextLike) => void | Promise<void>,
	): void;
	on(
		event: "before_agent_start",
		handler: (
			event: BeforeAgentStartEventLike,
			ctx: ExtensionContextLike,
		) => { systemPrompt?: string } | void | Promise<{ systemPrompt?: string } | void>,
	): void;
	on(
		event: "tool_call",
		handler: (
			event: ToolCallEventLike,
			ctx: ExtensionContextLike,
		) => ToolCallResultLike | void | Promise<ToolCallResultLike | void>,
	): void;
	registerTool(tool: ToolDefinitionLike): void;
	getAllTools(): Array<{ name: string }>;
}

export function createRunnerSubagentRuntimeExtension(
	options: RunnerSubagentRuntimeExtensionOptions,
) {
	return function runnerSubagentRuntimeExtension(pi: ExtensionApiLike): void {
		let config: RuntimeConfigV1 | undefined;
		let startupError: Error | undefined;
		let terminalCaptured = false;
		let terminalToolNames = new Set<string>();

		const configRead = readRuntimeConfigFileSync(options.configPath);
		if (configRead.type === "loaded") {
			config = configRead.config;
			terminalToolNames = new Set(config.terminalTools.map((tool) => tool.name));
		} else {
			startupError = new Error(configRead.failure.message);
			writeRuntimeError(
				options.resultPath,
				"config-error",
				`Invalid subagent terminal runtime config: ${startupError.message}`,
			);
		}

		pi.on("session_start", () => {
			if (!config || startupError) return;

			const existingTools = new Set(pi.getAllTools().map((tool) => tool.name));
			const collisions = config.terminalTools
				.filter((tool) => existingTools.has(tool.name))
				.map((tool) => tool.name);
			if (collisions.length > 0) {
				startupError = new Error(
					`Subagent terminal tool name collision: ${collisions.join(", ")}.`,
				);
				writeRuntimeError(options.resultPath, "tool-collision", startupError.message);
				return;
			}

			for (const terminalTool of config.terminalTools) {
				pi.registerTool({
					name: terminalTool.name,
					label: terminalToolLabel(terminalTool.name, terminalTool.status),
					description: terminalTool.description,
					promptSnippet: `${terminalTool.name} captures the final subagent ${terminalTool.status} outcome and then stops.`,
					promptGuidelines: terminalPromptGuidelines(terminalTool.name, terminalTool.status),
					parameters: terminalTool.parameters,
					executionMode: "sequential",
					async execute(toolCallId, params, _signal, _onUpdate, ctx) {
						const capture: RuntimeResultV1 = {
							version: 1,
							kind: "terminal-capture",
							toolName: terminalTool.name,
							...(toolCallId.length === 0 ? {} : { toolCallId }),
							status: terminalTool.status,
							input: params,
						};

						try {
							writeRuntimeResultFileSync(options.resultPath, capture);
							terminalCaptured = true;
						} catch (error) {
							const message = `Failed to write subagent terminal capture: ${formatErrorMessage(error)}`;
							writeRuntimeError(options.resultPath, "write-error", message);
							throw new Error(message);
						}

						ctx.abort?.();
						return {
							content: [
								{
									type: "text",
									text: `Captured ${terminalTool.status} subagent outcome with ${terminalTool.name}.`,
								},
							],
							details: {},
							terminate: true,
						};
					},
				});
			}
		});

		pi.on("before_agent_start", (event, ctx) => {
			if (startupError) {
				ctx.abort?.();
				return {
					systemPrompt: `${event.systemPrompt}\n\nSubagent terminal-capture runtime failed before agent start: ${startupError.message}`,
				};
			}
			if (!config) return;
			return {
				systemPrompt: `${event.systemPrompt}\n\n${runnerSubagentBoundaryInstructions(config)}`,
			};
		});

		pi.on("tool_call", (event) => {
			if (config?.filesystemRoot !== undefined) {
				const filesystemBlock = cwdFilesystemBlockReason(event, config.filesystemRoot);
				if (filesystemBlock !== undefined) return { block: true, reason: filesystemBlock };
			}
			if (!terminalCaptured || terminalToolNames.has(event.toolName)) return;
			return {
				block: true,
				reason:
					"A runner subagent terminal capture has already been recorded; no further non-terminal tools may run.",
			};
		});
	};
}

function runnerSubagentBoundaryInstructions(config: RuntimeConfigV1): string {
	const sections: string[] = [];
	if (config.filesystemRoot !== undefined) {
		sections.push(
			"Explorer filesystem boundary:",
			`- Keep read, grep, find, and ls paths lexically inside the dispatch cwd: ${config.filesystemRoot}`,
		);
	}
	if (config.terminalTools.length > 0) {
		const tools = config.terminalTools
			.map((tool) => `- ${tool.name}: report ${tool.status} when ${tool.description}`)
			.join("\n");
		sections.push(
			"Subagent terminal-capture protocol:",
			"- When you have a final outcome for the delegated subagent task, call exactly one terminal capture tool.",
			"- Do not call any other tool in the same assistant message as a terminal capture tool.",
			"- Terminal capture tools are capture-only and final; they do not perform domain side effects.",
			"- Use a completed terminal tool only when the requested subagent task reached its structured terminal condition.",
			"- Use a blocked terminal tool when parent or user follow-up is needed; include blockers in the structured payload.",
			"Available terminal capture tools:",
			tools,
		);
	}
	return sections.join("\n\n");
}

const FILESYSTEM_TOOLS = new Set(["read", "grep", "find", "ls"]);
const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/gu;

function cwdFilesystemBlockReason(
	event: ToolCallEventLike,
	filesystemRoot: string,
): string | undefined {
	if (!FILESYSTEM_TOOLS.has(event.toolName)) return undefined;
	const path = filesystemToolPath(event);
	if (path === undefined) return filesystemBlockReason(event.toolName, "a valid path");
	const normalizedPath = path.replace(UNICODE_SPACES, " ");
	const toolPath = normalizedPath.startsWith("@") ? normalizedPath.slice(1) : normalizedPath;
	if (toolPath.startsWith("file://")) {
		return filesystemBlockReason(event.toolName, "a path inside the dispatch cwd");
	}
	if (toolPath === "~" || toolPath.startsWith("~/") || toolPath.startsWith("~\\")) {
		return filesystemBlockReason(event.toolName, "a path inside the dispatch cwd");
	}
	const root = resolve(filesystemRoot);
	const target = resolve(root, toolPath);
	const fromRoot = relative(root, target);
	if (
		fromRoot === "" ||
		(fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot))
	) {
		return undefined;
	}
	return filesystemBlockReason(event.toolName, "a path inside the dispatch cwd");
}

function filesystemToolPath(event: ToolCallEventLike): string | undefined {
	if (!isRecord(event.input)) return undefined;
	const path = event.input.path;
	if (path === undefined && event.toolName !== "read") return ".";
	return typeof path === "string" ? path : undefined;
}

function filesystemBlockReason(toolName: string, expected: string): string {
	return `Blocked ${toolName}: explorer paths must use ${expected}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function terminalToolLabel(name: string, status: string): string {
	return `${status === "completed" ? "Complete" : "Block"} Subagent (${name})`;
}

function terminalPromptGuidelines(name: string, status: string): string[] {
	return [
		`Use ${name} only as the final subagent capture tool for a ${status} outcome.`,
		`When calling ${name}, do not call any other tool in the same assistant message.`,
	];
}

function writeRuntimeError(
	resultPath: string,
	code: Extract<RuntimeResultV1, { kind: "runtime-error" }>["code"],
	message: string,
): void {
	try {
		writeRuntimeResultFileSync(resultPath, {
			version: 1,
			kind: "runtime-error",
			code,
			message,
		});
	} catch {
		// The parent also observes subagent stderr/exit; avoid corrupting JSON stdout from inside the runtime.
	}
}
