import { commandSucceeded, type CommandResolver } from "@nseng-ai/foundation/command";
import { defaultCommandResolver } from "@nseng-ai/foundation/exec";
import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/command";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { resultErr } from "@nseng-ai/foundation/result";

import type { ReviewResult } from "../core/failures.ts";
import type { ReviewExecutionResponse } from "../core/models.ts";
import {
	RealCodexReviewOutputFiles,
	type CodexReviewOutputFiles,
	type CodexReviewOutputHandle,
} from "./codex-review-output-files.ts";
import {
	buildReviewFindingsJsonSchema,
	reviewResponseFromFindingsPayload,
} from "./review-findings-output.ts";
import type {
	PreparedReviewHarnessRequest,
	ReviewHarnessRunner,
	RunReviewOptions,
} from "./review-runner.ts";
import { systemPromptFindings } from "./review-runner-prompt.ts";

export const CODEX_BINARY = "codex";

export interface CodexProcessReviewRunnerOptions {
	readonly execApi: CommandExecApi;
	readonly binaryResolver?: CommandResolver;
	readonly outputFiles?: CodexReviewOutputFiles;
}

interface ExecutePreparedOptions {
	readonly binary: string;
	readonly request: PreparedReviewHarnessRequest;
	readonly runOptions: RunReviewOptions;
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
		request: PreparedReviewHarnessRequest,
		options: RunReviewOptions,
	): Promise<ReviewResult<ReviewExecutionResponse>> {
		const binary = resolveCodexBinary(this.binaryResolver);
		if (!binary.ok) return binary;

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
				request,
				runOptions: options,
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
		const { binary, request, runOptions, outputHandle } = options;
		const args = buildCodexArgs({ modelId: request.modelSelection.modelId, handle: outputHandle });
		const execOptions: ExecOptions = {
			cwd: runOptions.cwd,
			stdin: buildCodexPrompt(request.promptText),
			...(runOptions.env === undefined ? {} : { env: runOptions.env }),
			...(runOptions.signal === undefined ? {} : { signal: runOptions.signal }),
		};
		const result = await this.execApi.exec(binary, args, execOptions);
		if (result.type === "spawn-failed") {
			return resultErr({ code: "harness-invocation-failed", message: result.error });
		}
		if (result.type === "cancelled") {
			return resultErr({
				code: "review-execution-cancelled",
				message: codexExecutionMessage(result),
			});
		}
		if (!commandSucceeded(result)) {
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
		return parseCodexReviewOutput(output, request.inputCoverage);
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
	switch (result.type) {
		case "spawn-failed":
			return result.error;
		case "cancelled":
			return "Codex execution was cancelled.";
		case "timed-out":
			return "Codex execution timed out.";
		case "exited":
			return result.signal === null
				? `Codex exited with status ${result.code}.`
				: `Codex exited after signal ${result.signal} (status ${result.code ?? "unknown"}).`;
	}
}
