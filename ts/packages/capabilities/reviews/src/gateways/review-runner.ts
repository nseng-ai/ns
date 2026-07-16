import { type CommandResolver } from "@nseng-ai/foundation/command";
import { defaultCommandResolver } from "@nseng-ai/foundation/exec";
import {
	commandSucceeded,
	type CommandExecApi,
	type ExecOptions,
	type ExecResult,
} from "@nseng-ai/foundation/command";
import {
	formatErrorMessage,
	mapFromRecordOrMap,
	type ExplicitUndefined,
} from "@nseng-ai/foundation/primitives";
import { resultErr } from "@nseng-ai/foundation/result";

import type { ReviewResult } from "../core/failures.ts";
import {
	createFindingsReview,
	reviewRunnerRequestSchema,
	reviewExecutionResponseSchema,
	type ReviewRunnerRequest,
	type ReviewExecutionResponse,
	type ReviewInputCoverage,
} from "../core/models.ts";
import { resolveReviewsModelReference } from "../core/review-model-reference.ts";
import { buildClaudeCodeArgs, parseClaudeCodeReviewOutput } from "./claude-code-review-runner.ts";
import { assembleReviewPrompt, systemPromptFindings } from "./review-runner-prompt.ts";

export const CLAUDE_BINARY = "claude";

export interface RunReviewOptions {
	readonly cwd: string;
	readonly env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export interface ReviewRunnerGateway {
	runReview(
		request: ReviewRunnerRequest,
		options: RunReviewOptions,
	): Promise<ReviewResult<ReviewExecutionResponse>>;
}

export interface PreparedReviewHarnessRequest {
	readonly modelId: string;
	readonly promptText: string;
	readonly inputCoverage: ReviewInputCoverage;
}

export interface ReviewHarnessRunner {
	runReview(
		request: PreparedReviewHarnessRequest,
		options: RunReviewOptions,
	): Promise<ReviewResult<ReviewExecutionResponse>>;
}

export interface RoutingReviewRunnerOptions {
	readonly claudeCode: ReviewHarnessRunner;
	readonly codex: ReviewHarnessRunner;
	readonly pi: ReviewHarnessRunner;
}

export class RoutingReviewRunner implements ReviewRunnerGateway {
	private readonly claudeCode: ReviewHarnessRunner;
	private readonly codex: ReviewHarnessRunner;
	private readonly pi: ReviewHarnessRunner;

	constructor(options: RoutingReviewRunnerOptions) {
		this.claudeCode = options.claudeCode;
		this.codex = options.codex;
		this.pi = options.pi;
	}

	async runReview(
		request: ReviewRunnerRequest,
		options: RunReviewOptions,
	): Promise<ReviewResult<ReviewExecutionResponse>> {
		const resolved = resolveReviewsModelReference(request.model);
		if (!resolved.ok) return resolved;
		const assembled = assembleReviewPrompt(request);
		const preparedRequest: PreparedReviewHarnessRequest = {
			modelId: resolved.value.modelId,
			promptText: assembled.promptText,
			inputCoverage: assembled.inputCoverage,
		};
		switch (resolved.value.harness) {
			case "claude-code":
				return await this.claudeCode.runReview(preparedRequest, options);
			case "codex":
				return await this.codex.runReview(preparedRequest, options);
			case "pi":
				return await this.pi.runReview(preparedRequest, options);
		}
	}
}

export interface ClaudeCodeProcessReviewRunnerOptions {
	readonly execApi: CommandExecApi;
	readonly binaryResolver?: CommandResolver;
}

export interface FakeReviewRunnerGatewayOptions {
	readonly resultsByReviewName?:
		| ReadonlyMap<string, ReviewResult<ReviewExecutionResponse>>
		| Record<string, ReviewResult<ReviewExecutionResponse>>;
	readonly defaultResult?: ReviewResult<ReviewExecutionResponse>;
}

export class FakeReviewRunnerGateway implements ReviewRunnerGateway {
	private readonly resultsByReviewName: Map<string, ReviewResult<ReviewExecutionResponse>>;
	private readonly defaultResult: ReviewResult<ReviewExecutionResponse>;
	private readonly callsInternal: { request: ReviewRunnerRequest; options: RunReviewOptions }[] =
		[];

	constructor(options: FakeReviewRunnerGatewayOptions = {}) {
		this.resultsByReviewName = new Map<string, ReviewResult<ReviewExecutionResponse>>();
		for (const [key, value] of mapFromRecordOrMap(options.resultsByReviewName)) {
			this.resultsByReviewName.set(key, copyResult(value));
		}
		this.defaultResult = copyResult(
			options.defaultResult ?? {
				ok: true,
				value: { payload: createFindingsReview([]), usage: null, inputCoverage: null },
			},
		);
	}

	async runReview(
		request: ReviewRunnerRequest,
		options: RunReviewOptions,
	): Promise<ReviewResult<ReviewExecutionResponse>> {
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

export class ClaudeCodeProcessReviewRunner implements ReviewHarnessRunner {
	private readonly execApi: CommandExecApi;
	private readonly binaryResolver: CommandResolver;

	constructor(options: ClaudeCodeProcessReviewRunnerOptions) {
		this.execApi = options.execApi;
		this.binaryResolver = options.binaryResolver ?? defaultCommandResolver;
	}

	async runReview(
		request: PreparedReviewHarnessRequest,
		options: RunReviewOptions,
	): Promise<ReviewResult<ReviewExecutionResponse>> {
		let resolvedBinary: string | undefined;
		try {
			resolvedBinary = this.binaryResolver(CLAUDE_BINARY);
		} catch (error) {
			return resultErr({
				code: "harness-invocation-failed",
				message: `Failed to resolve Claude Code binary: ${formatErrorMessage(error)}`,
			});
		}
		if (resolvedBinary === undefined) {
			return resultErr({
				code: "harness-binary-missing",
				message: "Claude Code binary 'claude' was not found on PATH.",
			});
		}

		const args = buildClaudeCodeArgs({
			model: request.modelId,
			systemPrompt: systemPromptFindings(),
		});
		let result: ExecResult;
		const execOptions: ExecOptions = {
			cwd: options.cwd,
			stdin: request.promptText,
			...(options.env === undefined ? {} : { env: options.env }),
			...(options.signal === undefined ? {} : { signal: options.signal }),
		};
		try {
			result = await this.execApi.exec(resolvedBinary, args, execOptions);
		} catch (error) {
			return resultErr({
				code: "harness-invocation-failed",
				message: `Failed to invoke Claude Code: ${formatErrorMessage(error)}`,
			});
		}

		if (result.type === "spawn-failed") {
			return resultErr({ code: "harness-invocation-failed", message: result.error });
		}
		if (result.type === "cancelled") {
			return resultErr({
				code: "review-execution-cancelled",
				message: runnerExecutionMessage(result),
			});
		}
		if (!commandSucceeded(result)) {
			return resultErr({
				code: "harness-execution-failed",
				message: runnerExecutionMessage(result),
			});
		}

		return parseClaudeCodeReviewOutput({
			stdout: result.stdout,
			inputCoverage: request.inputCoverage,
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

function copyRequest(request: ReviewRunnerRequest): ReviewRunnerRequest {
	return reviewRunnerRequestSchema.parse(structuredClone(request));
}

function copyResult(
	result: ReviewResult<ReviewExecutionResponse>,
): ReviewResult<ReviewExecutionResponse> {
	if (result.ok) {
		return {
			ok: true,
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
