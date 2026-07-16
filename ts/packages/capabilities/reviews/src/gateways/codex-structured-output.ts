import {
	commandSucceeded,
	type CommandExecApi,
	type CommandResolver,
	type ExecResult,
} from "@nseng-ai/foundation/command";
import { defaultCommandResolver } from "@nseng-ai/foundation/exec";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";

import {
	RealCodexStructuredOutputFiles,
	type CodexStructuredOutputFiles,
	type CodexStructuredOutputHandle,
} from "./codex-structured-output-files.ts";
import {
	resolveHarnessBinary,
	structuredOutputExecOptions,
	transportFailure,
	type CodexStructuredOutputRequest,
	type StructuredOutputRunOptions,
	type StructuredOutputTransportOutcome,
} from "./structured-output-transport.ts";

export const CODEX_BINARY = "codex";

export interface CodexStructuredOutputTransportOptions {
	readonly execApi: CommandExecApi;
	readonly binaryResolver?: CommandResolver;
	readonly outputFiles?: CodexStructuredOutputFiles;
}

interface ExecutePreparedOptions {
	readonly binary: string;
	readonly request: CodexStructuredOutputRequest;
	readonly runOptions: StructuredOutputRunOptions;
	readonly outputHandle: CodexStructuredOutputHandle;
}

export class CodexStructuredOutputTransport {
	private readonly execApi: CommandExecApi;
	private readonly binaryResolver: CommandResolver;
	private readonly outputFiles: CodexStructuredOutputFiles;

	constructor(options: CodexStructuredOutputTransportOptions) {
		this.execApi = options.execApi;
		this.binaryResolver = options.binaryResolver ?? defaultCommandResolver;
		this.outputFiles = options.outputFiles ?? new RealCodexStructuredOutputFiles();
	}

	async run(
		request: CodexStructuredOutputRequest,
		options: StructuredOutputRunOptions,
	): Promise<StructuredOutputTransportOutcome> {
		const binary = resolveHarnessBinary(this.binaryResolver, CODEX_BINARY, "Codex");
		if (!binary.ok) return binary;

		let handle: CodexStructuredOutputHandle;
		try {
			handle = await this.outputFiles.prepare(request.jsonSchema);
		} catch (error) {
			return transportFailure(
				"invocation-failed",
				`Failed to prepare Codex structured output files: ${formatErrorMessage(error)}`,
			);
		}

		let primary: StructuredOutputTransportOutcome;
		try {
			primary = await this.executePrepared({
				binary: binary.value,
				request,
				runOptions: options,
				outputHandle: handle,
			});
		} catch (error) {
			primary = transportFailure(
				"invocation-failed",
				`Failed to invoke Codex: ${formatErrorMessage(error)}`,
			);
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
	): Promise<StructuredOutputTransportOutcome> {
		const { binary, request, runOptions, outputHandle } = options;
		const result = await this.execApi.exec(
			binary,
			buildCodexArgs({ modelId: request.modelId, handle: outputHandle }),
			structuredOutputExecOptions(runOptions, buildCodexPrompt(request)),
		);
		if (result.type === "spawn-failed") {
			return transportFailure("invocation-failed", result.error);
		}
		if (result.type === "cancelled") {
			return transportFailure("cancelled", codexExecutionMessage(result));
		}
		if (!commandSucceeded(result)) {
			return transportFailure("execution-failed", codexExecutionMessage(result));
		}

		let output: string;
		try {
			output = await this.outputFiles.readOutput(outputHandle);
		} catch (error) {
			return transportFailure(
				"output-read-failed",
				`Failed to read Codex structured output: ${formatErrorMessage(error)}`,
			);
		}
		return parseCodexStructuredOutput(output);
	}
}

export function buildCodexArgs(options: {
	readonly modelId: string;
	readonly handle: CodexStructuredOutputHandle;
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

export function buildCodexPrompt(
	request: Pick<CodexStructuredOutputRequest, "systemPrompt" | "promptText" | "inputTag">,
): string {
	return [
		"<system-instructions>",
		request.systemPrompt,
		"</system-instructions>",
		"",
		`<${request.inputTag}>`,
		request.promptText,
		`</${request.inputTag}>`,
	].join("\n");
}

export function parseCodexStructuredOutput(output: string): StructuredOutputTransportOutcome {
	if (output.trim() === "") {
		return transportFailure("empty-output", "Codex produced no structured output.");
	}
	try {
		return { ok: true, value: { payload: JSON.parse(output) as unknown, usage: null } };
	} catch (error) {
		return transportFailure(
			"invalid-json",
			`Codex structured output was not valid JSON: ${formatErrorMessage(error)}`,
		);
	}
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
