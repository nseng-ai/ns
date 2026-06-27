import {
	defaultCommandResolver,
	type CommandExecApi,
	type CommandResolver,
	type ExecOptions,
	type ExecResult,
} from "@sdl/core/exec";
import { isClaudeCodeSupportedModelPattern } from "@sdl/core/model-slug";
import { formatErrorMessage, mapFromRecordOrMap } from "@sdl/core/primitives";

import type { RoasterResult } from "../failures.ts";
import {
	createFindingsReview,
	reviewRunnerRequestSchema,
	reviewExecutionResponseSchema,
	type ReviewRunnerRequest,
	type ReviewExecutionResponse,
} from "../models.ts";
import { buildClaudeCodeArgs, parseClaudeCodeReviewOutput } from "./claude-code-review-runner.ts";
import { assembleReviewPrompt, systemPromptFindings } from "./review-runner-prompt.ts";

export const CLAUDE_BINARY = "claude";

export interface RunReviewOptions {
	readonly cwd: string;
	readonly env?: NodeJS.ProcessEnv | undefined;
	readonly signal?: AbortSignal | undefined;
}

export interface ReviewRunnerGateway {
	runReview(
		request: ReviewRunnerRequest,
		options: RunReviewOptions,
	): Promise<RoasterResult<ReviewExecutionResponse>>;
}

export interface ClaudeCodeProcessReviewRunnerOptions {
	readonly execApi: CommandExecApi;
	readonly binaryResolver?: CommandResolver | undefined;
}

export interface FakeReviewRunnerGatewayOptions {
	readonly resultsByReviewName?:
		| ReadonlyMap<string, RoasterResult<ReviewExecutionResponse>>
		| Record<string, RoasterResult<ReviewExecutionResponse>>
		| undefined;
	readonly defaultResult?: RoasterResult<ReviewExecutionResponse> | undefined;
}

export class FakeReviewRunnerGateway implements ReviewRunnerGateway {
	private readonly resultsByReviewName: Map<string, RoasterResult<ReviewExecutionResponse>>;
	private readonly defaultResult: RoasterResult<ReviewExecutionResponse>;
	private readonly callsInternal: { request: ReviewRunnerRequest; options: RunReviewOptions }[] =
		[];

	constructor(options: FakeReviewRunnerGatewayOptions = {}) {
		this.resultsByReviewName = new Map<string, RoasterResult<ReviewExecutionResponse>>();
		for (const [key, value] of mapFromRecordOrMap(options.resultsByReviewName)) {
			this.resultsByReviewName.set(key, copyResult(value));
		}
		this.defaultResult = copyResult(
			options.defaultResult ?? {
				type: "ok",
				value: { payload: createFindingsReview([]), usage: null, inputCoverage: null },
			},
		);
	}

	async runReview(
		request: ReviewRunnerRequest,
		options: RunReviewOptions,
	): Promise<RoasterResult<ReviewExecutionResponse>> {
		const copiedRequest = copyRequest(request);
		this.callsInternal.push({ request: copiedRequest, options: copyRunReviewOptions(options) });
		return copyResult(
			this.resultsByReviewName.get(request.reviewDefinition.name) ?? this.defaultResult,
		);
	}

	calls(): readonly {
		readonly request: ReviewRunnerRequest;
		readonly options: RunReviewOptions;
	}[] {
		return this.callsInternal.map((call) => ({
			request: copyRequest(call.request),
			options: copyRunReviewOptions(call.options),
		}));
	}
}

export class ClaudeCodeProcessReviewRunner implements ReviewRunnerGateway {
	private readonly execApi: CommandExecApi;
	private readonly binaryResolver: CommandResolver;

	constructor(options: ClaudeCodeProcessReviewRunnerOptions) {
		this.execApi = options.execApi;
		this.binaryResolver = options.binaryResolver ?? defaultCommandResolver;
	}

	async runReview(
		request: ReviewRunnerRequest,
		options: RunReviewOptions,
	): Promise<RoasterResult<ReviewExecutionResponse>> {
		if (request.model.trim() === "") {
			return runnerError({
				type: "model_not_provided",
				message: "A Claude Code model must be provided.",
			});
		}
		if (!isClaudeCodeSupportedModelPattern(request.model)) {
			return runnerError({
				type: "model_not_supported_by_harness",
				message: `Model is not supported by the Claude Code harness: ${request.model}`,
			});
		}

		let resolvedBinary: string | undefined;
		try {
			resolvedBinary = this.binaryResolver(CLAUDE_BINARY);
		} catch (error) {
			return runnerError({
				type: "harness_invocation_failed",
				message: `Failed to resolve Claude Code binary: ${formatErrorMessage(error)}`,
			});
		}
		if (resolvedBinary === undefined) {
			return runnerError({
				type: "harness_binary_missing",
				message: "Claude Code binary 'claude' was not found on PATH.",
			});
		}

		const assembled = assembleReviewPrompt({
			reviewDefinition: request.reviewDefinition,
			target: request.target,
		});
		const args = buildClaudeCodeArgs({
			model: request.model,
			systemPrompt: systemPromptFindings(),
		});
		let result: ExecResult;
		const execOptions: ExecOptions = {
			cwd: options.cwd,
			stdin: assembled.promptText,
			...(options.env === undefined ? {} : { env: options.env }),
			...(options.signal === undefined ? {} : { signal: options.signal }),
		};
		try {
			result = await this.execApi.exec(CLAUDE_BINARY, args, execOptions);
		} catch (error) {
			return runnerError({
				type: "harness_invocation_failed",
				message: `Failed to invoke Claude Code: ${formatErrorMessage(error)}`,
			});
		}

		if (result.startupError !== undefined) {
			return runnerError({ type: "harness_invocation_failed", message: result.startupError });
		}
		if (result.code !== 0 || result.killed) {
			return runnerError({
				type: "harness_execution_failed",
				message: runnerExecutionMessage(result),
			});
		}

		return parseClaudeCodeReviewOutput({
			stdout: result.stdout,
			inputCoverage: assembled.inputCoverage,
		});
	}
}

function runnerExecutionMessage(result: ExecResult): string {
	const stderr = result.stderr.trim();
	if (stderr !== "") return stderr;
	const stdout = result.stdout.trimEnd();
	if (stdout !== "") {
		const lines = stdout.split("\n");
		return lines[lines.length - 1] ?? stdout;
	}
	return result.killed
		? `Claude Code exited with status ${result.code} after being killed or timed out.`
		: `Claude Code exited with status ${result.code}.`;
}

function copyRequest(request: ReviewRunnerRequest): ReviewRunnerRequest {
	return reviewRunnerRequestSchema.parse(structuredClone(request));
}

function copyResult(
	result: RoasterResult<ReviewExecutionResponse>,
): RoasterResult<ReviewExecutionResponse> {
	if (result.type === "ok") {
		return {
			type: "ok",
			value: reviewExecutionResponseSchema.parse(structuredClone(result.value)),
		};
	}
	return structuredClone(result);
}

function copyRunReviewOptions(options: RunReviewOptions): RunReviewOptions {
	return {
		cwd: options.cwd,
		...(options.env === undefined ? {} : { env: { ...options.env } }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	};
}

function runnerError(
	error: Extract<RoasterResult<never>, { readonly type: "error" }>["error"],
): RoasterResult<never> {
	return { type: "error", error };
}
