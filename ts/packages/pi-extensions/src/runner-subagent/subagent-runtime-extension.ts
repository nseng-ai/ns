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
	on(event: "session_start", handler: (event: unknown, ctx: ExtensionContextLike) => void | Promise<void>): void;
	on(
		event: "before_agent_start",
		handler: (
			event: BeforeAgentStartEventLike,
			ctx: ExtensionContextLike,
		) => { systemPrompt?: string } | void | Promise<{ systemPrompt?: string } | void>,
	): void;
	on(
		event: "tool_call",
		handler: (event: ToolCallEventLike, ctx: ExtensionContextLike) => ToolCallResultLike | void | Promise<ToolCallResultLike | void>,
	): void;
	registerTool(tool: ToolDefinitionLike): void;
	getAllTools(): Array<{ name: string }>;
}

export function createRunnerSubagentRuntimeExtension(options: RunnerSubagentRuntimeExtensionOptions) {
	return function runnerSubagentRuntimeExtension(pi: ExtensionApiLike): void {
		let config: RuntimeConfigV1 | undefined;
		let startupError: Error | undefined;
		let terminalCaptured = false;
		let terminalToolNames = new Set<string>();

		try {
			config = readRuntimeConfigFileSync(options.configPath);
			terminalToolNames = new Set(config.terminalTools.map((tool) => tool.name));
		} catch (error) {
			startupError = toError(error);
			writeRuntimeError(options.resultPath, "config-error", `Invalid subagent terminal runtime config: ${startupError.message}`);
		}

		pi.on("session_start", () => {
			if (!config || startupError) return;

			const existingTools = new Set(pi.getAllTools().map((tool) => tool.name));
			const collisions = config.terminalTools.filter((tool) => existingTools.has(tool.name)).map((tool) => tool.name);
			if (collisions.length > 0) {
				startupError = new Error(`Subagent terminal tool name collision: ${collisions.join(", ")}.`);
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
							const message = `Failed to write subagent terminal capture: ${errorMessage(error)}`;
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
			return { systemPrompt: `${event.systemPrompt}\n\n${runnerSubagentBoundaryInstructions(config)}` };
		});

		pi.on("tool_call", (event) => {
			if (!terminalCaptured || terminalToolNames.has(event.toolName)) return;
			return {
				block: true,
				reason: "A runner subagent terminal capture has already been recorded; no further non-terminal tools may run.",
			};
		});
	};
}

function runnerSubagentBoundaryInstructions(config: RuntimeConfigV1): string {
	const tools = config.terminalTools
		.map((tool) => `- ${tool.name}: report ${tool.status} when ${tool.description}`)
		.join("\n");
	return [
		"Subagent terminal-capture protocol:",
		"- When you have a final outcome for the delegated subagent task, call exactly one terminal capture tool.",
		"- Do not call any other tool in the same assistant message as a terminal capture tool.",
		"- Terminal capture tools are capture-only and final; they do not perform domain side effects.",
		"- Use a completed terminal tool only when the requested subagent task reached its structured terminal condition.",
		"- Use a blocked terminal tool when parent or user follow-up is needed; include blockers in the structured payload.",
		"Available terminal capture tools:",
		tools,
	].join("\n");
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

function toError(error: unknown): Error {
	if (error instanceof Error) return error;
	return new Error(String(error));
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
