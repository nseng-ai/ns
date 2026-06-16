import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defaultCommandResolver, type CommandExecApi, type CommandResolver, type ExecOptions, type ExecResult } from "@asdl/core/exec";
import { formatErrorMessage, isRecord } from "@asdl/core/primitives";
import { z } from "zod";

import { estimateTokens } from "../diff-parsing.ts";
import type { RoasterResult } from "../failures.ts";
import {
	createFindingsReview,
	harnessReviewRequestSchema,
	reviewExecutionResponseSchema,
	severityValues,
	type HarnessReviewRequest,
	type ReviewExecutionResponse,
	type ReviewFinding,
	type ReviewInputCoverage,
	type ReviewUsage,
} from "../models.ts";

export const MAX_PROMPT_DIFF_TOKENS = 120_000;
export const MAX_PROMPT_DIFF_FILE_TOKENS = 40_000;
const CLAUDE_BINARY = "claude";
const TRUNCATED_MODEL_RESPONSE_CHARS = 500;

const claudeFindingSchema = z
	.object({
		path: z.string().trim().min(1),
		line: z.int().positive().nullable(),
		severity: z.enum(severityValues),
		summary: z.string().trim().min(1),
		details: z.string().trim().min(1),
	})
	.strict();
const claudeFindingsPayloadSchema = z
	.object({
		findings: z.array(claudeFindingSchema),
	})
	.strict();

type ClaudeFindingsPayload = z.infer<typeof claudeFindingsPayloadSchema>;

export interface RunReviewOptions {
	readonly cwd: string;
	readonly env?: NodeJS.ProcessEnv | undefined;
	readonly signal?: AbortSignal | undefined;
}

export interface HarnessGateway {
	runReview(request: HarnessReviewRequest, options: RunReviewOptions): Promise<RoasterResult<ReviewExecutionResponse>>;
}

export interface PromptSizedDiffResult {
	readonly diffText: string;
	readonly inputCoverage: ReviewInputCoverage;
}

export interface AssembledReviewPrompt {
	readonly promptText: string;
	readonly inputCoverage: ReviewInputCoverage;
}

export interface RealHarnessGatewayOptions {
	readonly execApi: CommandExecApi;
	readonly binaryResolver?: CommandResolver | undefined;
}

export interface FakeHarnessGatewayOptions {
	readonly resultsByReviewName?: ReadonlyMap<string, RoasterResult<ReviewExecutionResponse>> | Record<string, RoasterResult<ReviewExecutionResponse>> | undefined;
	readonly defaultResult?: RoasterResult<ReviewExecutionResponse> | undefined;
}

export class FakeHarnessGateway implements HarnessGateway {
	private readonly resultsByReviewName: Map<string, RoasterResult<ReviewExecutionResponse>>;
	private readonly defaultResult: RoasterResult<ReviewExecutionResponse>;
	private readonly callsInternal: { request: HarnessReviewRequest; options: RunReviewOptions }[] = [];

	constructor(options: FakeHarnessGatewayOptions = {}) {
		this.resultsByReviewName = new Map<string, RoasterResult<ReviewExecutionResponse>>();
		if (options.resultsByReviewName instanceof Map) {
			for (const [key, value] of options.resultsByReviewName.entries()) {
				this.resultsByReviewName.set(key, copyResult(value));
			}
		} else if (options.resultsByReviewName !== undefined) {
			for (const [key, value] of Object.entries(options.resultsByReviewName)) {
				this.resultsByReviewName.set(key, copyResult(value));
			}
		}
		this.defaultResult = copyResult(options.defaultResult ?? { type: "ok", value: { payload: createFindingsReview([]), usage: null, inputCoverage: null } });
	}

	async runReview(request: HarnessReviewRequest, options: RunReviewOptions): Promise<RoasterResult<ReviewExecutionResponse>> {
		const copiedRequest = copyRequest(request);
		this.callsInternal.push({ request: copiedRequest, options: copyRunReviewOptions(options) });
		return copyResult(this.resultsByReviewName.get(request.reviewDefinition.name) ?? this.defaultResult);
	}

	calls(): readonly { readonly request: HarnessReviewRequest; readonly options: RunReviewOptions }[] {
		return this.callsInternal.map((call) => ({ request: copyRequest(call.request), options: copyRunReviewOptions(call.options) }));
	}
}

export class RealHarnessGateway implements HarnessGateway {
	private readonly execApi: CommandExecApi;
	private readonly binaryResolver: CommandResolver;

	constructor(options: RealHarnessGatewayOptions) {
		this.execApi = options.execApi;
		this.binaryResolver = options.binaryResolver ?? defaultCommandResolver;
	}

	async runReview(request: HarnessReviewRequest, options: RunReviewOptions): Promise<RoasterResult<ReviewExecutionResponse>> {
		if (request.model.trim() === "") {
			return harnessError({ type: "model_not_provided", message: "A Claude Code model must be provided." });
		}
		if (!isClaudeCodeSupportedModel(request.model)) {
			return harnessError({ type: "model_not_supported_by_harness", message: `Model is not supported by the Claude Code harness: ${request.model}`, model: request.model });
		}

		let resolvedBinary: string | undefined;
		try {
			resolvedBinary = this.binaryResolver(CLAUDE_BINARY);
		} catch (error) {
			return harnessError({ type: "harness_invocation_failed", message: `Failed to resolve Claude Code binary: ${formatErrorMessage(error)}` });
		}
		if (resolvedBinary === undefined) {
			return harnessError({ type: "harness_binary_missing", message: "Claude Code binary 'claude' was not found on PATH." });
		}

		const assembled = assembleReviewPrompt({ reviewDefinition: request.reviewDefinition, target: request.target });
		const args = buildClaudeCodeArgs({ model: request.model, systemPrompt: systemPromptFindings() });
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
			return harnessError({ type: "harness_invocation_failed", message: `Failed to invoke Claude Code: ${formatErrorMessage(error)}` });
		}

		if (result.startupError !== undefined) {
			return harnessError({ type: "harness_invocation_failed", message: result.startupError });
		}
		if (result.code !== 0 || result.killed) {
			return harnessError({
				type: "harness_execution_failed",
				message: harnessExecutionMessage(result),
				stderr: result.stderr,
				code: result.code,
			});
		}

		return parseClaudeCodeReviewOutput({ stdout: result.stdout, inputCoverage: assembled.inputCoverage });
	}
}

export function isClaudeCodeSupportedModel(model: string): boolean {
	const normalized = model.trim();
	return normalized === "sonnet" || normalized === "opus" || normalized === "haiku" || normalized.startsWith("claude-");
}

export function systemPromptFindings(): string {
	return readPromptAsset("review_system_findings.md").trim();
}

export function reviewPromptTemplate(): string {
	return readPromptAsset("review_prompt.md");
}

export function assembleReviewPrompt(request: Pick<HarnessReviewRequest, "reviewDefinition" | "target">): AssembledReviewPrompt {
	const sizedDiff = promptSizedDiff(request.target.localDiff);
	const changedPaths = request.target.localDiff.changedPaths.length === 0 ? "(no changed paths reported)" : request.target.localDiff.changedPaths.map((path) => `- ${path}`).join("\n");
	const promptText = renderNamedTemplate(reviewPromptTemplate(), {
		review_name: request.reviewDefinition.name,
		review_description: request.reviewDefinition.description,
		review_instructions: request.reviewDefinition.instructions,
		base_ref: request.target.localDiff.baseRef,
		changed_path_count: String(request.target.localDiff.changedPaths.length),
		changed_paths: changedPaths,
		diff_block: renderPromptFence(sizedDiff.diffText, { language: "diff" }),
	}).trim();

	return { promptText, inputCoverage: sizedDiff.inputCoverage };
}

export function renderPromptFence(content: string, options: { readonly language: string }): string {
	const longestRun = longestBacktickRun(content);
	const fence = "`".repeat(Math.max(3, longestRun + 1));
	return `${fence}${options.language}\n${content}\n${fence}`;
}

export function promptSizedDiff(localDiff: HarnessReviewRequest["target"]["localDiff"]): PromptSizedDiffResult {
	const fullDiffEstimatedTokens = estimateTokens(localDiff.diffText);
	const omittedFiles: ReviewInputCoverage["omittedFiles"] = [];
	const includedRawTexts: string[] = [];
	let includedTokens = 0;
	let includedFileCount = 0;

	for (const file of localDiff.files) {
		if (file.estimatedTokens > MAX_PROMPT_DIFF_FILE_TOKENS) {
			omittedFiles.push(omittedReviewInputFile(file, "file_exceeds_cap"));
			continue;
		}
		if (includedTokens + file.estimatedTokens > MAX_PROMPT_DIFF_TOKENS) {
			omittedFiles.push(omittedReviewInputFile(file, "diff_budget_exhausted"));
			continue;
		}
		includedRawTexts.push(file.rawText);
		includedTokens += file.estimatedTokens;
		includedFileCount += 1;
	}

	const inputCoverage = {
		fullDiffEstimatedTokens,
		promptDiffTokenCap: MAX_PROMPT_DIFF_TOKENS,
		promptDiffFileTokenCap: MAX_PROMPT_DIFF_FILE_TOKENS,
		changedPathCount: localDiff.changedPaths.length,
		includedFileCount,
		omittedFileCount: omittedFiles.length,
		omittedFiles,
	} satisfies ReviewInputCoverage;

	if (omittedFiles.length === 0 && fullDiffEstimatedTokens <= MAX_PROMPT_DIFF_TOKENS) {
		return { diffText: localDiff.diffText, inputCoverage };
	}

	const header = buildCappedDiffHeader(inputCoverage);
	const body = includedRawTexts.join("");
	return { diffText: body.length === 0 ? header.trimEnd() : `${header}\n${body}`, inputCoverage };
}

export function buildClaudeDiffFindingsJsonSchema(): Record<string, unknown> {
	const schema = z.toJSONSchema(claudeFindingsPayloadSchema, { io: "output" }) as Record<string, unknown>;
	// Claude Code accepts draft schema keywords but omits structured_output when the top-level schema URI is present.
	delete schema.$schema;
	return schema;
}

export function buildClaudeCodeArgs(options: { readonly model: string; readonly systemPrompt: string }): string[] {
	return [
		"-p",
		"--output-format",
		"json",
		"--bare",
		"--tools",
		"Bash,Read",
		"--model",
		options.model,
		"--system-prompt",
		options.systemPrompt,
		"--json-schema",
		JSON.stringify(buildClaudeDiffFindingsJsonSchema()),
	];
}

export function parseClaudeCodeReviewOutput(options: { readonly stdout: string; readonly inputCoverage: ReviewInputCoverage | null }): RoasterResult<ReviewExecutionResponse> {
	if (options.stdout.trim() === "") {
		return harnessError({ type: "review_execution_empty_output", message: "Claude Code produced no JSON output." });
	}

	const parsed = parseClaudeCodeOutputJson(options.stdout);
	if (parsed.type === "error") return parsed;

	const resultEvent = resultEventFromParsedOutput(parsed.value);
	if (resultEvent.type === "error") return resultEvent;

	if (Object.hasOwn(resultEvent.value, "structured_output")) {
		const findingsResult = claudeFindingsPayloadSchema.safeParse(resultEvent.value.structured_output);
		if (!findingsResult.success) {
			return harnessError({ type: "review_execution_invalid_findings", message: `Claude Code structured output did not match the findings schema: ${findingsResult.error.message}` });
		}
		return reviewResponseFromClaudePayload(findingsResult.data, resultEvent.value, options.inputCoverage);
	}

	if (typeof resultEvent.value.result === "string") {
		const prose = truncateModelResponse(resultEvent.value.result);
		return harnessError({
			type: "review_execution_invalid_response",
			message: `Claude Code returned prose instead of structured_output: ${prose}\nConfirm --json-schema is honored by the installed Claude Code binary.`,
		});
	}

	return harnessError({ type: "review_execution_invalid_response", message: "Claude Code result event did not include structured_output." });
}

function resultEventFromParsedOutput(parsed: unknown): RoasterResult<Record<string, unknown>> {
	if (Array.isArray(parsed)) {
		for (const item of parsed) {
			if (!isRecord(item)) {
				return harnessError({ type: "review_execution_invalid_response", message: "Claude Code event stream contained a non-object event." });
			}
		}
		const resultEvent = parsed.find((item): item is Record<string, unknown> => isRecord(item) && item.type === "result");
		if (resultEvent === undefined) {
			return harnessError({ type: "review_execution_invalid_response", message: "Claude Code event stream did not include a terminal result event." });
		}
		return { type: "ok", value: resultEvent };
	}
	if (!isRecord(parsed)) {
		return harnessError({ type: "review_execution_invalid_response", message: "Claude Code output JSON must be an object or event array." });
	}
	return { type: "ok", value: parsed };
}

function reviewResponseFromClaudePayload(payload: ClaudeFindingsPayload, resultEvent: Record<string, unknown>, inputCoverage: ReviewInputCoverage | null): RoasterResult<ReviewExecutionResponse> {
	const findings: ReviewFinding[] = payload.findings.map((finding) => ({ ...finding }));
	try {
		const response = reviewExecutionResponseSchema.parse({
			payload: createFindingsReview(findings),
			usage: usageFromResultEvent(resultEvent),
			inputCoverage,
		});
		return { type: "ok", value: response };
	} catch (error) {
		return harnessError({ type: "review_execution_invalid_findings", message: `Claude Code structured output did not match the findings schema: ${formatErrorMessage(error)}` });
	}
}

function parseClaudeCodeOutputJson(stdout: string): RoasterResult<unknown> {
	try {
		return { type: "ok", value: JSON.parse(stdout) as unknown };
	} catch (error) {
		return harnessError({ type: "review_execution_invalid_json", message: `Claude Code output was not valid JSON: ${formatErrorMessage(error)}` });
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

function omittedReviewInputFile(file: HarnessReviewRequest["target"]["localDiff"]["files"][number], reason: ReviewInputCoverage["omittedFiles"][number]["reason"]): ReviewInputCoverage["omittedFiles"][number] {
	return {
		path: file.path.trim() === "" ? "(unknown path)" : file.path,
		changeKind: file.changeKind,
		byteSize: file.byteSize,
		estimatedTokens: file.estimatedTokens,
		addedLines: file.addedLines,
		removedLines: file.removedLines,
		reason,
	};
}

function buildCappedDiffHeader(coverage: ReviewInputCoverage): string {
	const lines = [
		"# Roaster note: diff input was capped before sending to the review model.",
		`# Full diff estimate: ~${coverage.fullDiffEstimatedTokens} tokens; prompt diff cap: ${coverage.promptDiffTokenCap} tokens; per-file cap: ${coverage.promptDiffFileTokenCap} tokens.`,
		"# Omitted file diffs:",
		...coverage.omittedFiles.map(
			(file) =>
				`# - ${file.path} (${file.changeKind}, ${file.byteSize} bytes, ~${file.estimatedTokens} tokens, +${file.addedLines}/-${file.removedLines}; ${file.reason.replaceAll("_", " ")})`,
		),
		"# Included file diffs follow.",
	];
	return lines.join("\n");
}

function renderNamedTemplate(template: string, fields: Record<string, string>): string {
	let rendered = template;
	for (const [name, value] of Object.entries(fields)) {
		rendered = rendered.replaceAll(`{${name}}`, value);
	}
	return rendered;
}

function readPromptAsset(name: string): string {
	return readFileSync(fileURLToPath(new URL(`../prompts/${name}`, import.meta.url)), "utf8");
}

function longestBacktickRun(content: string): number {
	let longest = 0;
	for (const match of content.matchAll(/`+/g)) {
		longest = Math.max(longest, match[0].length);
	}
	return longest;
}

function harnessExecutionMessage(result: ExecResult): string {
	const stderr = result.stderr.trim();
	if (stderr !== "") return stderr;
	const stdout = result.stdout.trimEnd();
	if (stdout !== "") {
		const lines = stdout.split("\n");
		return lines[lines.length - 1] ?? stdout;
	}
	return result.killed ? `Claude Code exited with status ${result.code} after being killed or timed out.` : `Claude Code exited with status ${result.code}.`;
}

function truncateModelResponse(response: string): string {
	return response.length <= TRUNCATED_MODEL_RESPONSE_CHARS ? response : `${response.slice(0, TRUNCATED_MODEL_RESPONSE_CHARS)}…`;
}

function copyRequest(request: HarnessReviewRequest): HarnessReviewRequest {
	return harnessReviewRequestSchema.parse(structuredClone(request));
}

function copyResult(result: RoasterResult<ReviewExecutionResponse>): RoasterResult<ReviewExecutionResponse> {
	if (result.type === "ok") {
		return { type: "ok", value: reviewExecutionResponseSchema.parse(structuredClone(result.value)) };
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

function harnessError(error: Extract<RoasterResult<never>, { readonly type: "error" }>["error"]): RoasterResult<never> {
	return { type: "error", error };
}
