import type { CommandResolver, ExecOptions } from "@nseng-ai/foundation/command";
import { formatErrorMessage, type ExplicitUndefined } from "@nseng-ai/foundation/primitives";
import {
	resultErr,
	type ErrorInfo,
	type Result,
	type ResultErr,
} from "@nseng-ai/foundation/result";

import type { ReviewUsage } from "../core/models.ts";

/**
 * Internal Reviews-owned structured-output transport.
 *
 * The transport owns stable harness protocol and subprocess mechanics only:
 * provider dispatch, binary resolution, read-only CLI invocation, cancellation
 * and execution classification, Codex output-file lifecycle, Claude
 * terminal-result parsing, JSON decoding, and optional usage normalization.
 * It returns an unvalidated structured payload; the review and aggregation
 * adapters own domain Zod validation and domain failure mapping.
 */

export interface ClaudeCodeStructuredOutputRequest {
	readonly harness: "claude-code";
	readonly modelId: string;
	readonly systemPrompt: string;
	readonly promptText: string;
	readonly jsonSchema: Readonly<Record<string, unknown>>;
	readonly tools: readonly ("Bash" | "Read")[];
}

export interface CodexStructuredOutputRequest {
	readonly harness: "codex";
	readonly modelId: string;
	readonly systemPrompt: string;
	readonly promptText: string;
	readonly inputTag: "review-input" | "aggregation-input";
	readonly jsonSchema: Readonly<Record<string, unknown>>;
}

export interface PiStructuredOutputRequest {
	readonly harness: "pi";
	readonly modelId: string;
	readonly systemPrompt: string;
	readonly promptText: string;
	readonly jsonSchema: Readonly<Record<string, unknown>>;
}

export type StructuredOutputHarnessRequest =
	| ClaudeCodeStructuredOutputRequest
	| CodexStructuredOutputRequest
	| PiStructuredOutputRequest;

export interface StructuredOutputRunOptions {
	readonly cwd: string;
	readonly env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export interface StructuredOutputTransportResult {
	readonly payload: unknown;
	readonly usage: ReviewUsage | null;
}

export type StructuredOutputTransportFailureCode =
	| "binary-missing"
	| "invocation-failed"
	| "execution-failed"
	| "cancelled"
	| "empty-output"
	| "invalid-json"
	| "invalid-response"
	| "output-read-failed";

export interface StructuredOutputTransportFailure extends ErrorInfo {
	readonly code: StructuredOutputTransportFailureCode;
}

export type StructuredOutputTransportOutcome = Result<
	StructuredOutputTransportResult,
	StructuredOutputTransportFailure
>;

export interface StructuredOutputTransport {
	run(
		request: StructuredOutputHarnessRequest,
		options: StructuredOutputRunOptions,
	): Promise<StructuredOutputTransportOutcome>;
}

export interface RoutingStructuredOutputTransportOptions {
	readonly claudeCode: {
		run(
			request: ClaudeCodeStructuredOutputRequest,
			options: StructuredOutputRunOptions,
		): Promise<StructuredOutputTransportOutcome>;
	};
	readonly codex: {
		run(
			request: CodexStructuredOutputRequest,
			options: StructuredOutputRunOptions,
		): Promise<StructuredOutputTransportOutcome>;
	};
	readonly pi: {
		run(
			request: PiStructuredOutputRequest,
			options: StructuredOutputRunOptions,
		): Promise<StructuredOutputTransportOutcome>;
	};
}

export class RoutingStructuredOutputTransport implements StructuredOutputTransport {
	private readonly claudeCode: RoutingStructuredOutputTransportOptions["claudeCode"];
	private readonly codex: RoutingStructuredOutputTransportOptions["codex"];
	private readonly pi: RoutingStructuredOutputTransportOptions["pi"];

	constructor(options: RoutingStructuredOutputTransportOptions) {
		this.claudeCode = options.claudeCode;
		this.codex = options.codex;
		this.pi = options.pi;
	}

	async run(
		request: StructuredOutputHarnessRequest,
		options: StructuredOutputRunOptions,
	): Promise<StructuredOutputTransportOutcome> {
		switch (request.harness) {
			case "claude-code":
				return await this.claudeCode.run(request, options);
			case "codex":
				return await this.codex.run(request, options);
			case "pi":
				return await this.pi.run(request, options);
		}
	}
}

export function structuredOutputHarnessLabel(
	harness: StructuredOutputHarnessRequest["harness"],
): "Claude Code" | "Codex" | "Pi" {
	switch (harness) {
		case "claude-code":
			return "Claude Code";
		case "codex":
			return "Codex";
		case "pi":
			return "Pi";
	}
}

export function transportFailure(
	code: StructuredOutputTransportFailureCode,
	message: string,
): ResultErr<StructuredOutputTransportFailure> {
	return resultErr({ code, message });
}

export function resolveHarnessBinary(
	resolver: CommandResolver,
	binary: string,
	label: string,
): Result<string, StructuredOutputTransportFailure> {
	try {
		const resolved = resolver(binary);
		if (resolved !== undefined) return { ok: true, value: resolved };
	} catch (error) {
		return transportFailure(
			"invocation-failed",
			`Failed to resolve ${label} binary: ${formatErrorMessage(error)}`,
		);
	}
	return transportFailure("binary-missing", `${label} binary '${binary}' was not found on PATH.`);
}

export function structuredOutputExecOptions(
	options: StructuredOutputRunOptions,
	stdin: string,
): ExecOptions {
	return {
		cwd: options.cwd,
		stdin,
		...(options.env === undefined ? {} : { env: options.env }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	};
}
