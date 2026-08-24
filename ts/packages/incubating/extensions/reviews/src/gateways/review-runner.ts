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
import type {
	ModelExecutionCoordinator,
	ModelExecutionSelection,
} from "@nseng-ai/extension-kit/model-execution";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";

import type { ReviewResult } from "../core/failures.ts";
import {
	createFindingsReview,
	reviewRunnerRequestSchema,
	reviewExecutionResponseSchema,
	type ReviewRunnerRequest,
	type ReviewExecutionResponse,
	type ReviewInputCoverage,
} from "../core/models.ts";
import { resolveReviewsModelSelection } from "../core/review-model-reference.ts";
import { buildClaudeCodeArgs, parseClaudeCodeReviewOutput } from "./claude-code-review-runner.ts";
import { reviewHarnessExecutionMessage } from "./review-harness-execution-message.ts";
import { assembleReviewPrompt, systemPromptFindings } from "./review-runner-prompt.ts";

export const CLAUDE_BINARY = "claude";

export interface RunReviewOptions {
	readonly cwd: string;
	readonly env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export interface ReviewRunnerExecutionRequest extends Omit<ReviewRunnerRequest, "modelSelection"> {
	readonly modelExecutionSelection: ModelExecutionSelection;
}

export interface ReviewRunnerGateway {
	runReview(
		request: ReviewRunnerExecutionRequest,
		options: RunReviewOptions,
	): Promise<ReviewResult<ReviewExecutionResponse>>;
}

export interface PreparedReviewHarnessRequest {
	readonly modelSelection: ModelSelection;
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
	readonly modelExecutionCoordinator: ModelExecutionCoordinator;
	readonly claudeCode: ReviewHarnessRunner;
	readonly codex: ReviewHarnessRunner;
	readonly pi: ReviewHarnessRunner;
}

export class RoutingReviewRunner implements ReviewRunnerGateway {
	private readonly modelExecutionCoordinator: ModelExecutionCoordinator;
	private readonly claudeCode: ReviewHarnessRunner;
	private readonly codex: ReviewHarnessRunner;
	private readonly pi: ReviewHarnessRunner;

	constructor(options: RoutingReviewRunnerOptions) {
		this.modelExecutionCoordinator = options.modelExecutionCoordinator;
		this.claudeCode = options.claudeCode;
		this.codex = options.codex;
		this.pi = options.pi;
	}

	async runReview(
		request: ReviewRunnerExecutionRequest,
		options: RunReviewOptions,
	): Promise<ReviewResult<ReviewExecutionResponse>> {
		const { modelExecutionSelection, ...requestWithoutModel } = request;
		const plainRequest: ReviewRunnerRequest = {
			...requestWithoutModel,
			modelSelection: modelExecutionSelection.modelSelection,
		};
		const resolved = resolveReviewsModelSelection(plainRequest.modelSelection);
		if (!resolved.ok) return resolved;
		const assembled = assembleReviewPrompt(plainRequest);
		const preparedRequest: PreparedReviewHarnessRequest = {
			modelSelection: resolved.value.selection,
			promptText: assembled.promptText,
			inputCoverage: assembled.inputCoverage,
		};
		switch (resolved.value.harness) {
			case "claude-code":
				this.modelExecutionCoordinator.beforeExecution(modelExecutionSelection);
				return await this.claudeCode.runReview(preparedRequest, options);
			case "codex":
				this.modelExecutionCoordinator.beforeExecution(modelExecutionSelection);
				return await this.codex.runReview(preparedRequest, options);
			case "pi":
				this.modelExecutionCoordinator.beforeExecution(modelExecutionSelection);
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
	private readonly callsInternal: {
		request: ReviewRunnerExecutionRequest;
		options: RunReviewOptions;
	}[] = [];

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
		request: ReviewRunnerExecutionRequest,
		options: RunReviewOptions,
	): Promise<ReviewResult<ReviewExecutionResponse>> {
		const copiedRequest = copyRequest(request);
		this.callsInternal.push({ request: copiedRequest, options: copyRunReviewOptions(options) });
		return copyResult(
			this.resultsByReviewName.get(request.reviewDefinition.name) ?? this.defaultResult,
		);
	}

	calls(): readonly {
		readonly request: ReviewRunnerExecutionRequest;
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
		if (
			request.modelSelection.thinking === "off" ||
			request.modelSelection.thinking === "minimal"
		) {
			return resultErr({
				code: "model-not-supported-by-harness",
				message: `Claude Code does not support Reviews thinking level ${JSON.stringify(request.modelSelection.thinking)}. Configure the selected [models.profiles] entry with thinking = "low", "medium", "high", or "xhigh".`,
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

		const args = buildClaudeCodeArgs({
			model: request.modelSelection.modelId,
			thinking: request.modelSelection.thinking,
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
				message: reviewHarnessExecutionMessage(result, {
					harnessLabel: "Claude Code",
					useStdoutFallback: true,
				}),
			});
		}
		if (!commandSucceeded(result)) {
			return resultErr({
				code: "harness-execution-failed",
				message: reviewHarnessExecutionMessage(result, {
					harnessLabel: "Claude Code",
					useStdoutFallback: true,
				}),
			});
		}

		return parseClaudeCodeReviewOutput({
			stdout: result.stdout,
			inputCoverage: request.inputCoverage,
		});
	}
}

function copyRequest(request: ReviewRunnerExecutionRequest): ReviewRunnerExecutionRequest {
	const copy = structuredClone(request);
	const { modelExecutionSelection, ...requestWithoutModel } = copy;
	const plainRequest = reviewRunnerRequestSchema.parse({
		...requestWithoutModel,
		modelSelection: modelExecutionSelection.modelSelection,
	});
	return {
		...plainRequest,
		modelExecutionSelection: copy.modelExecutionSelection,
	};
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
