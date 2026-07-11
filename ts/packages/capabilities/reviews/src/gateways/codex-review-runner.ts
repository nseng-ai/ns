import { type CommandResolver } from "@nseng-ai/foundation/command";
import { defaultCommandResolver } from "@nseng-ai/foundation/exec";
import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/command";
import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";
import { resultErr } from "@nseng-ai/foundation/result";

import type { ReviewResult } from "../core/failures.ts";
import type { ReviewExecutionResponse, ReviewRunnerRequest } from "../core/models.ts";
import {
	RealCodexReviewOutputFiles,
	type CodexReviewOutputFiles,
	type CodexReviewOutputHandle,
} from "./codex-review-output-files.ts";
import {
	buildReviewFindingsJsonSchema,
	reviewResponseFromFindingsPayload,
} from "./review-findings-output.ts";
import type { ReviewHarnessRunner, RunReviewOptions } from "./review-runner.ts";
import { assembleReviewPrompt, systemPromptFindings } from "./review-runner-prompt.ts";

export const CODEX_BINARY = "codex";

export interface CodexProcessReviewRunnerOptions {
	readonly execApi: CommandExecApi;
	readonly binaryResolver?: CommandResolver;
	readonly outputFiles?: CodexReviewOutputFiles;
}

interface ExecutePreparedOptions {
	readonly binary: string;
	readonly modelId: string;
	readonly runOptions: RunReviewOptions;
	readonly assembled: ReturnType<typeof assembleReviewPrompt>;
	readonly outputHandle: CodexReviewOutputHandle;
}

export class CodexProcessReviewRunner implements ReviewHarnessRunner {
	private readonly execApi: CommandExecApi;
	private readonly binaryResolver: CommandResolver;
	private readonly outputFiles: CodexReviewOutputFiles;

	constructor(options: CodexProcessReviewRunnerOptions) {
		this.execApi = options.execApi;
		this.binaryResolver = options.binaryResolver ?? defaultCommandResolver;
		this.outputFiles = options.outputFiles ?? new RealCodexReviewOutputFiles();
	}

	async runReview(
		request: ReviewRunnerRequest,
		modelId: string,
		options: RunReviewOptions,
	): Promise<ReviewResult<ReviewExecutionResponse>> {
		const binary = resolveCodexBinary(this.binaryResolver);
		if (!binary.ok) return binary;

		const assembled = assembleReviewPrompt({
			reviewDefinition: request.reviewDefinition,
			reviewDir: request.reviewDir,
			target: request.target,
			...optionalEntry("priorFindingsContext", request.priorFindingsContext),
		});

		let handle: CodexReviewOutputHandle;
		try {
			handle = await this.outputFiles.prepare(buildReviewFindingsJsonSchema());
		} catch (error) {
			return resultErr({
				code: "harness-invocation-failed",
				message: `Failed to prepare Codex structured output files: ${formatErrorMessage(error)}`,
			});
		}

		let primary: ReviewResult<ReviewExecutionResponse>;
		try {
			primary = await this.executePrepared({
				binary: binary.value,
				modelId,
				runOptions: options,
				assembled,
				outputHandle: handle,
			});
		} catch (error) {
			primary = resultErr({
				code: "harness-invocation-failed",
				message: `Failed to invoke Codex: ${formatErrorMessage(error)}`,
			});
		}

		try {
			await this.outputFiles.cleanup(handle);
		} catch {
			// Temporary artifact cleanup is best effort and must not discard completed model work.
		}
		return primary;
	}

	private async executePrepared(
		options: ExecutePreparedOptions,
	): Promise<ReviewResult<ReviewExecutionResponse>> {
		const { binary, modelId, runOptions, assembled, outputHandle } = options;
		const args = buildCodexArgs({ modelId, handle: outputHandle });
		const execOptions: ExecOptions = {
			cwd: runOptions.cwd,
			stdin: buildCodexPrompt(assembled.promptText),
			...(runOptions.env === undefined ? {} : { env: runOptions.env }),
			...(runOptions.signal === undefined ? {} : { signal: runOptions.signal }),
		};
		const result = await this.execApi.exec(binary, args, execOptions);
		if (result.startupError !== undefined) {
			return resultErr({ code: "harness-invocation-failed", message: result.startupError });
		}
		if (result.code !== 0 || result.killed) {
			return resultErr({
				code: "harness-execution-failed",
				message: codexExecutionMessage(result),
			});
		}

		let output: string;
		try {
			output = await this.outputFiles.readOutput(outputHandle);
		} catch (error) {
			return resultErr({
				code: "review-execution-empty-output",
				message: `Failed to read Codex structured output: ${formatErrorMessage(error)}`,
			});
		}
		return parseCodexReviewOutput(output, assembled.inputCoverage);
	}
}

export function buildCodexArgs(options: {
	readonly modelId: string;
	readonly handle: CodexReviewOutputHandle;
}): string[] {
	return [
		"exec",
		"--model",
		options.modelId,
		"--sandbox",
		"read-only",
		"--ephemeral",
		"--ignore-user-config",
		"--output-schema",
		options.handle.schemaPath,
		"--output-last-message",
		options.handle.outputPath,
		"--color",
		"never",
		"-",
	];
}

export function buildCodexPrompt(reviewPrompt: string): string {
	return [
		"<system-instructions>",
		systemPromptFindings(),
		"</system-instructions>",
		"",
		"<review-input>",
		reviewPrompt,
		"</review-input>",
	].join("\n");
}

export function parseCodexReviewOutput(
	output: string,
	inputCoverage: ReviewExecutionResponse["inputCoverage"],
): ReviewResult<ReviewExecutionResponse> {
	if (output.trim() === "") {
		return resultErr({
			code: "review-execution-empty-output",
			message: "Codex produced no structured output.",
		});
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(output) as unknown;
	} catch (error) {
		return resultErr({
			code: "review-execution-invalid-json",
			message: `Codex structured output was not valid JSON: ${formatErrorMessage(error)}`,
		});
	}
	return reviewResponseFromFindingsPayload({
		payload: parsed,
		inputCoverage,
		usage: null,
		harnessLabel: "Codex",
	});
}

function resolveCodexBinary(binaryResolver: CommandResolver): ReviewResult<string> {
	try {
		const resolved = binaryResolver(CODEX_BINARY);
		if (resolved !== undefined) return { ok: true, value: resolved };
	} catch (error) {
		return resultErr({
			code: "harness-invocation-failed",
			message: `Failed to resolve Codex binary: ${formatErrorMessage(error)}`,
		});
	}
	return resultErr({
		code: "harness-binary-missing",
		message: "Codex binary 'codex' was not found on PATH.",
	});
}

function codexExecutionMessage(result: ExecResult): string {
	const stderr = result.stderr.trim();
	if (stderr !== "") return stderr;
	return result.killed
		? `Codex exited with status ${result.code} after being killed or timed out.`
		: `Codex exited with status ${result.code}.`;
}
