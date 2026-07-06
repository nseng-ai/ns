import { type CommandResolver } from "@nseng-ai/foundation/command";
import { defaultCommandResolver } from "@nseng-ai/foundation/exec";
import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/command";
import { isClaudeCodeSupportedModelPattern } from "@nseng-ai/foundation/model-slug";
import {
	formatErrorMessage,
	mapFromRecordOrMap,
	optionalEntry,
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
} from "../core/models.ts";
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
	): Promise<ReviewResult<ReviewExecutionResponse>> {
		if (request.model.trim() === "") {
			return resultErr({
				code: "model-not-provided",
				message: "A Claude Code model must be provided.",
			});
		}
		if (!isClaudeCodeSupportedModelPattern(request.model)) {
			return resultErr({
				code: "model-not-supported-by-harness",
				message: `Model is not supported by the Claude Code harness: ${request.model}`,
			});
		}

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

		const assembled = assembleReviewPrompt({
			reviewDefinition: request.reviewDefinition,
			reviewDir: request.reviewDir,
			target: request.target,
			...optionalEntry("priorFindingsContext", request.priorFindingsContext),
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
			return resultErr({
				code: "harness-invocation-failed",
				message: `Failed to invoke Claude Code: ${formatErrorMessage(error)}`,
			});
		}

		if (result.startupError !== undefined) {
			return resultErr({ code: "harness-invocation-failed", message: result.startupError });
		}
		if (result.code !== 0 || result.killed) {
			return resultErr({
				code: "harness-execution-failed",
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
