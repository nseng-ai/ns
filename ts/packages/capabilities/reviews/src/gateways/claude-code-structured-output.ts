import {
	commandSucceeded,
	type CommandExecApi,
	type CommandResolver,
	type ExecResult,
} from "@nseng-ai/foundation/command";
import { defaultCommandResolver } from "@nseng-ai/foundation/exec";
import { formatErrorMessage, isRecord } from "@nseng-ai/foundation/primitives";
import type { Result } from "@nseng-ai/foundation/result";
import { z } from "zod";

import type { ReviewUsage } from "../core/models.ts";
import {
	resolveHarnessBinary,
	structuredOutputExecOptions,
	transportFailure,
	type ClaudeCodeStructuredOutputRequest,
	type StructuredOutputRunOptions,
	type StructuredOutputTransportFailure,
	type StructuredOutputTransportOutcome,
} from "./structured-output-transport.ts";

export const CLAUDE_BINARY = "claude";

const TRUNCATED_MODEL_RESPONSE_CHARS = 500;

export interface ClaudeCodeStructuredOutputTransportOptions {
	readonly execApi: CommandExecApi;
	readonly binaryResolver?: CommandResolver;
}

export class ClaudeCodeStructuredOutputTransport {
	private readonly execApi: CommandExecApi;
	private readonly binaryResolver: CommandResolver;

	constructor(options: ClaudeCodeStructuredOutputTransportOptions) {
		this.execApi = options.execApi;
		this.binaryResolver = options.binaryResolver ?? defaultCommandResolver;
	}

	async run(
		request: ClaudeCodeStructuredOutputRequest,
		options: StructuredOutputRunOptions,
	): Promise<StructuredOutputTransportOutcome> {
		const binary = resolveHarnessBinary(this.binaryResolver, CLAUDE_BINARY, "Claude Code");
		if (!binary.ok) return binary;

		let result: ExecResult;
		try {
			result = await this.execApi.exec(
				binary.value,
				buildClaudeCodeArgs(request),
				structuredOutputExecOptions(options, request.promptText),
			);
		} catch (error) {
			return transportFailure(
				"invocation-failed",
				`Failed to invoke Claude Code: ${formatErrorMessage(error)}`,
			);
		}

		if (result.type === "spawn-failed") {
			return transportFailure("invocation-failed", result.error);
		}
		if (result.type === "cancelled") {
			return transportFailure("cancelled", claudeCodeExecutionMessage(result));
		}
		if (!commandSucceeded(result)) {
			return transportFailure("execution-failed", claudeCodeExecutionMessage(result));
		}

		return parseClaudeCodeStructuredOutput(result.stdout);
	}
}

export function buildClaudeCodeArgs(
	request: Pick<
		ClaudeCodeStructuredOutputRequest,
		"modelId" | "systemPrompt" | "jsonSchema" | "tools"
	>,
): string[] {
	return [
		"-p",
		"--output-format",
		"json",
		"--bare",
		"--tools",
		request.tools.join(","),
		"--model",
		request.modelId,
		"--system-prompt",
		request.systemPrompt,
		"--json-schema",
		JSON.stringify(request.jsonSchema),
	];
}

export function parseClaudeCodeStructuredOutput(stdout: string): StructuredOutputTransportOutcome {
	if (stdout.trim() === "") {
		return transportFailure("empty-output", "Claude Code produced no JSON output.");
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout) as unknown;
	} catch (error) {
		return transportFailure(
			"invalid-json",
			`Claude Code output was not valid JSON: ${formatErrorMessage(error)}`,
		);
	}

	const resultEvent = resultEventFromParsedOutput(parsed);
	if (!resultEvent.ok) return resultEvent;

	if (Object.hasOwn(resultEvent.value, "structured_output")) {
		return {
			ok: true,
			value: {
				payload: resultEvent.value.structured_output,
				usage: usageFromResultEvent(resultEvent.value),
			},
		};
	}

	if (typeof resultEvent.value.result === "string") {
		const prose = truncateModelResponse(resultEvent.value.result);
		return transportFailure(
			"invalid-response",
			`Claude Code returned prose instead of structured_output: ${prose}\nConfirm --json-schema is honored by the installed Claude Code binary.`,
		);
	}

	return transportFailure(
		"invalid-response",
		"Claude Code result event did not include structured_output.",
	);
}

function resultEventFromParsedOutput(
	parsed: unknown,
): Result<Record<string, unknown>, StructuredOutputTransportFailure> {
	if (Array.isArray(parsed)) {
		for (const item of parsed) {
			if (!isRecord(item)) {
				return transportFailure(
					"invalid-response",
					"Claude Code event stream contained a non-object event.",
				);
			}
		}
		const resultEvent = parsed.find(
			(item): item is Record<string, unknown> => isRecord(item) && item.type === "result",
		);
		if (resultEvent === undefined) {
			return transportFailure(
				"invalid-response",
				"Claude Code event stream did not include a terminal result event.",
			);
		}
		return { ok: true, value: resultEvent };
	}
	if (!isRecord(parsed)) {
		return transportFailure(
			"invalid-response",
			"Claude Code output JSON must be an object or event array.",
		);
	}
	return { ok: true, value: parsed };
}

function claudeCodeExecutionMessage(result: ExecResult): string {
	const stderr = result.stderr.trim();
	if (stderr !== "") return stderr;
	const stdout = result.stdout.trimEnd();
	if (stdout !== "") {
		const lines = stdout.split("\n");
		return lines[lines.length - 1] ?? stdout;
	}
	switch (result.type) {
		case "spawn-failed":
			return result.error;
		case "cancelled":
			return "Claude Code execution was cancelled.";
		case "timed-out":
			return "Claude Code execution timed out.";
		case "exited":
			return result.signal === null
				? `Claude Code exited with status ${result.code}.`
				: `Claude Code exited after signal ${result.signal} (status ${result.code ?? "unknown"}).`;
	}
}

function usageFromResultEvent(resultEvent: Record<string, unknown>): ReviewUsage | null {
	const usage = resultEvent.usage;
	if (!isRecord(usage)) return null;

	const parsed = {
		inputTokens: usage.input_tokens,
		outputTokens: usage.output_tokens,
		cacheCreationInputTokens: usage.cache_creation_input_tokens,
		cacheReadInputTokens: usage.cache_read_input_tokens,
		totalCostUsd: resultEvent.total_cost_usd,
		durationMs: resultEvent.duration_ms,
		numTurns: resultEvent.num_turns,
	};
	const result = z
		.object({
			inputTokens: z.int().min(0),
			outputTokens: z.int().min(0),
			cacheCreationInputTokens: z.int().min(0),
			cacheReadInputTokens: z.int().min(0),
			totalCostUsd: z.number().min(0),
			durationMs: z.int().min(0),
			numTurns: z.int().min(0),
		})
		.strict()
		.safeParse(parsed);
	return result.success ? result.data : null;
}

function truncateModelResponse(response: string): string {
	return response.length <= TRUNCATED_MODEL_RESPONSE_CHARS
		? response
		: `${response.slice(0, TRUNCATED_MODEL_RESPONSE_CHARS)}…`;
}
