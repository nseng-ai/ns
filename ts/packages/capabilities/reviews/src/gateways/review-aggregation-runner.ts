import type { CommandResolver } from "@nseng-ai/foundation/command";
import {
	commandSucceeded,
	type CommandExecApi,
	type ExecOptions,
	type ExecResult,
} from "@nseng-ai/foundation/command";
import { defaultCommandResolver } from "@nseng-ai/foundation/exec";
import { formatErrorMessage, type ExplicitUndefined } from "@nseng-ai/foundation/primitives";
import { resultErr } from "@nseng-ai/foundation/result";

import type { ReviewResult } from "../core/failures.ts";
import {
	reviewAggregationExecutionResponseSchema,
	reviewAggregationRunnerRequestSchema,
	type ReviewAggregationExecutionResponse,
	type ReviewAggregationRunnerRequest,
} from "../core/models.ts";
import { resolveReviewsModelReference } from "../core/review-model-reference.ts";
import {
	buildReviewAggregationJsonSchema,
	parseClaudeCodeAggregationOutput,
	parseCodexAggregationOutput,
} from "./review-aggregation-output.ts";
import {
	buildReviewAggregationPrompt,
	reviewAggregationSystemPrompt,
} from "./review-aggregation-prompt.ts";
import {
	RealCodexReviewOutputFiles,
	type CodexReviewOutputFiles,
	type CodexReviewOutputHandle,
} from "./codex-review-output-files.ts";

export interface RunReviewAggregationOptions {
	readonly cwd: string;
	readonly env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export interface ReviewAggregationRunnerGateway {
	runAggregation(
		request: ReviewAggregationRunnerRequest,
		options: RunReviewAggregationOptions,
	): Promise<ReviewResult<ReviewAggregationExecutionResponse>>;
}

interface PreparedAggregationRequest {
	readonly modelId: string;
	readonly promptText: string;
}

interface AggregationHarnessRunner {
	runAggregation(
		request: PreparedAggregationRequest,
		options: RunReviewAggregationOptions,
	): Promise<ReviewResult<ReviewAggregationExecutionResponse>>;
}

export class RoutingReviewAggregationRunner implements ReviewAggregationRunnerGateway {
	private readonly claudeCode: AggregationHarnessRunner;
	private readonly codex: AggregationHarnessRunner;

	constructor(options: {
		readonly claudeCode: AggregationHarnessRunner;
		readonly codex: AggregationHarnessRunner;
	}) {
		this.claudeCode = options.claudeCode;
		this.codex = options.codex;
	}

	async runAggregation(
		request: ReviewAggregationRunnerRequest,
		options: RunReviewAggregationOptions,
	): Promise<ReviewResult<ReviewAggregationExecutionResponse>> {
		const resolved = resolveReviewsModelReference(request.model);
		if (!resolved.ok) {
			return resultErr({
				code: "review-aggregation-model-resolution-failed",
				message: resolved.error.message,
			});
		}
		const prepared = {
			modelId: resolved.value.modelId,
			promptText: buildReviewAggregationPrompt(request),
		};
		return resolved.value.harness === "claude-code"
			? await this.claudeCode.runAggregation(prepared, options)
			: await this.codex.runAggregation(prepared, options);
	}
}

export class FakeReviewAggregationRunnerGateway implements ReviewAggregationRunnerGateway {
	private readonly result: ReviewResult<ReviewAggregationExecutionResponse>;
	private readonly callsInternal: {
		request: ReviewAggregationRunnerRequest;
		options: RunReviewAggregationOptions;
	}[] = [];

	constructor(
		result: ReviewResult<ReviewAggregationExecutionResponse> = {
			ok: true,
			value: { payload: { clusters: [] }, usage: null },
		},
	) {
		this.result = copyAggregationResult(result);
	}

	async runAggregation(
		request: ReviewAggregationRunnerRequest,
		options: RunReviewAggregationOptions,
	): Promise<ReviewResult<ReviewAggregationExecutionResponse>> {
		this.callsInternal.push({
			request: reviewAggregationRunnerRequestSchema.parse(structuredClone(request)),
			options: copyOptions(options),
		});
		return copyAggregationResult(this.result);
	}

	calls(): readonly {
		readonly request: ReviewAggregationRunnerRequest;
		readonly options: RunReviewAggregationOptions;
	}[] {
		return this.callsInternal.map((call) => ({
			request: reviewAggregationRunnerRequestSchema.parse(structuredClone(call.request)),
			options: copyOptions(call.options),
		}));
	}
}

export class ClaudeCodeProcessReviewAggregationRunner implements AggregationHarnessRunner {
	private readonly execApi: CommandExecApi;
	private readonly binaryResolver: CommandResolver;

	constructor(options: {
		readonly execApi: CommandExecApi;
		readonly binaryResolver?: CommandResolver;
	}) {
		this.execApi = options.execApi;
		this.binaryResolver = options.binaryResolver ?? defaultCommandResolver;
	}

	async runAggregation(
		request: PreparedAggregationRequest,
		options: RunReviewAggregationOptions,
	): Promise<ReviewResult<ReviewAggregationExecutionResponse>> {
		const binary = resolveBinary(this.binaryResolver, "claude", "Claude Code");
		if (!binary.ok) return binary;
		const args = [
			"-p",
			"--output-format",
			"json",
			"--bare",
			"--tools",
			"Read",
			"--model",
			request.modelId,
			"--system-prompt",
			reviewAggregationSystemPrompt(),
			"--json-schema",
			JSON.stringify(buildReviewAggregationJsonSchema()),
		];
		const result = await execute(this.execApi, binary.value, args, request.promptText, options);
		if (!result.ok) return result;
		return parseClaudeCodeAggregationOutput(result.value.stdout);
	}
}

export class CodexProcessReviewAggregationRunner implements AggregationHarnessRunner {
	private readonly execApi: CommandExecApi;
	private readonly binaryResolver: CommandResolver;
	private readonly outputFiles: CodexReviewOutputFiles;

	constructor(options: {
		readonly execApi: CommandExecApi;
		readonly binaryResolver?: CommandResolver;
		readonly outputFiles?: CodexReviewOutputFiles;
	}) {
		this.execApi = options.execApi;
		this.binaryResolver = options.binaryResolver ?? defaultCommandResolver;
		this.outputFiles = options.outputFiles ?? new RealCodexReviewOutputFiles();
	}

	async runAggregation(
		request: PreparedAggregationRequest,
		options: RunReviewAggregationOptions,
	): Promise<ReviewResult<ReviewAggregationExecutionResponse>> {
		const binary = resolveBinary(this.binaryResolver, "codex", "Codex");
		if (!binary.ok) return binary;
		let handle: CodexReviewOutputHandle;
		try {
			handle = await this.outputFiles.prepare(buildReviewAggregationJsonSchema());
		} catch (error) {
			return invocationFailure(
				`Failed to prepare Codex structured output files: ${formatErrorMessage(error)}`,
			);
		}
		try {
			const args = [
				"exec",
				"--model",
				request.modelId,
				"--sandbox",
				"read-only",
				"--ephemeral",
				"--ignore-user-config",
				"--output-schema",
				handle.schemaPath,
				"--output-last-message",
				handle.outputPath,
				"--color",
				"never",
				"-",
			];
			const prompt = `<system-instructions>\n${reviewAggregationSystemPrompt()}\n</system-instructions>\n\n<aggregation-input>\n${request.promptText}\n</aggregation-input>`;
			const result = await execute(this.execApi, binary.value, args, prompt, options);
			if (!result.ok) return result;
			let output: string;
			try {
				output = await this.outputFiles.readOutput(handle);
			} catch (error) {
				return invocationFailure(
					`Failed to read Codex structured output: ${formatErrorMessage(error)}`,
				);
			}
			return parseCodexAggregationOutput(output);
		} finally {
			try {
				await this.outputFiles.cleanup(handle);
			} catch {
				// Temporary artifact cleanup is best effort.
			}
		}
	}
}

async function execute(
	execApi: CommandExecApi,
	binary: string,
	args: string[],
	stdin: string,
	options: RunReviewAggregationOptions,
): Promise<ReviewResult<ExecResult>> {
	const execOptions: ExecOptions = {
		cwd: options.cwd,
		stdin,
		...(options.env === undefined ? {} : { env: options.env }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	};
	let result: ExecResult;
	try {
		result = await execApi.exec(binary, args, execOptions);
	} catch (error) {
		return invocationFailure(
			`Failed to invoke review aggregation harness: ${formatErrorMessage(error)}`,
		);
	}
	if (result.type === "cancelled") {
		return resultErr({ code: "review-aggregation-cancelled", message: executionMessage(result) });
	}
	if (!commandSucceeded(result)) return invocationFailure(executionMessage(result));
	return { ok: true, value: result };
}

function resolveBinary(
	resolver: CommandResolver,
	name: string,
	label: string,
): ReviewResult<string> {
	try {
		const binary = resolver(name);
		if (binary !== undefined) return { ok: true, value: binary };
	} catch (error) {
		return invocationFailure(`Failed to resolve ${label} binary: ${formatErrorMessage(error)}`);
	}
	return invocationFailure(`${label} binary '${name}' was not found on PATH.`);
}

function invocationFailure(message: string): ReviewResult<never> {
	return resultErr({ code: "review-aggregation-invocation-failed", message });
}

function executionMessage(result: ExecResult): string {
	if (result.stderr.trim() !== "") return result.stderr.trim();
	if (result.stdout.trim() !== "")
		return result.stdout.trimEnd().split("\n").at(-1) ?? result.stdout;
	switch (result.type) {
		case "spawn-failed":
			return result.error;
		case "cancelled":
			return "Review aggregation was cancelled.";
		case "timed-out":
			return "Review aggregation timed out.";
		case "exited":
			return `Review aggregation exited with status ${result.code ?? "unknown"}.`;
	}
}

function copyAggregationResult(
	result: ReviewResult<ReviewAggregationExecutionResponse>,
): ReviewResult<ReviewAggregationExecutionResponse> {
	return result.ok
		? {
				ok: true,
				value: reviewAggregationExecutionResponseSchema.parse(structuredClone(result.value)),
			}
		: structuredClone(result);
}

function copyOptions(options: RunReviewAggregationOptions): RunReviewAggregationOptions {
	return {
		cwd: options.cwd,
		...(options.env === undefined ? {} : { env: { ...options.env } }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	};
}
