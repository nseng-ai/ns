import { commandSucceeded, type CommandResolver } from "@nseng-ai/foundation/command";
import { defaultCommandResolver } from "@nseng-ai/foundation/exec";
import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/command";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { resultErr } from "@nseng-ai/foundation/result";

import type { ReviewResult } from "../core/failures.ts";
import type { ReviewExecutionResponse } from "../core/models.ts";
import { reviewResponseFromFindingsPayload } from "./review-findings-output.ts";
import type {
	PreparedReviewHarnessRequest,
	ReviewHarnessRunner,
	RunReviewOptions,
} from "./review-runner.ts";
import { systemPromptFindingsJsonText } from "./review-runner-prompt.ts";

export const PI_BINARY = "pi";

export interface PiProcessReviewRunnerOptions {
	readonly execApi: CommandExecApi;
	readonly binaryResolver?: CommandResolver;
}

export class PiProcessReviewRunner implements ReviewHarnessRunner {
	private readonly execApi: CommandExecApi;
	private readonly binaryResolver: CommandResolver;

	constructor(options: PiProcessReviewRunnerOptions) {
		this.execApi = options.execApi;
		this.binaryResolver = options.binaryResolver ?? defaultCommandResolver;
	}

	async runReview(
		request: PreparedReviewHarnessRequest,
		options: RunReviewOptions,
	): Promise<ReviewResult<ReviewExecutionResponse>> {
		const binary = resolvePiBinary(this.binaryResolver);
		if (!binary.ok) return binary;

		const execOptions: ExecOptions = {
			cwd: options.cwd,
			stdin: request.promptText,
			...(options.env === undefined ? {} : { env: options.env }),
			...(options.signal === undefined ? {} : { signal: options.signal }),
		};
		let result: ExecResult;
		try {
			result = await this.execApi.exec(
				binary.value,
				buildPiReviewArgs(request.modelId),
				execOptions,
			);
		} catch (error) {
			return resultErr({
				code: "harness-invocation-failed",
				message: `Failed to invoke Pi: ${formatErrorMessage(error)}`,
			});
		}

		if (result.type === "spawn-failed") {
			return resultErr({ code: "harness-invocation-failed", message: result.error });
		}
		if (result.type === "cancelled") {
			return resultErr({
				code: "review-execution-cancelled",
				message: piExecutionMessage(result),
			});
		}
		if (!commandSucceeded(result)) {
			return resultErr({
				code: "harness-execution-failed",
				message: piExecutionMessage(result),
			});
		}

		return parsePiReviewOutput(result.stdout, request.inputCoverage);
	}
}

export function buildPiReviewArgs(modelId: string): string[] {
	return [
		"--provider",
		"vercel-ai-gateway",
		"--model",
		modelId,
		"--thinking",
		"minimal",
		"--system-prompt",
		systemPromptFindingsJsonText(),
		"--no-session",
		"--no-extensions",
		"--no-skills",
		"--no-prompt-templates",
		"--no-context-files",
		"--tools",
		"read,bash",
		"--mode",
		"text",
		"--print",
	];
}

export function parsePiReviewOutput(
	output: string,
	inputCoverage: ReviewExecutionResponse["inputCoverage"],
): ReviewResult<ReviewExecutionResponse> {
	const trimmed = output.trim();
	if (trimmed === "") {
		return resultErr({
			code: "review-execution-empty-output",
			message: "Pi produced no findings output.",
		});
	}

	const parsed = parseSingleJsonObject(trimmed);
	if (!parsed.ok) {
		return resultErr({
			code: "review-execution-invalid-json",
			message: `Pi findings output was not exactly one valid JSON object: ${parsed.error}`,
		});
	}
	return reviewResponseFromFindingsPayload({
		payload: parsed.value,
		inputCoverage,
		usage: null,
		harnessLabel: "Pi",
	});
}

function resolvePiBinary(binaryResolver: CommandResolver): ReviewResult<string> {
	try {
		const resolved = binaryResolver(PI_BINARY);
		if (resolved !== undefined) return { ok: true, value: resolved };
	} catch (error) {
		return resultErr({
			code: "harness-invocation-failed",
			message: `Failed to resolve Pi binary: ${formatErrorMessage(error)}`,
		});
	}
	return resultErr({
		code: "harness-binary-missing",
		message: "Pi binary 'pi' was not found on PATH.",
	});
}

function parseSingleJsonObject(
	text: string,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string } {
	const wholeCandidate = unwrapJsonFence(text);
	if (wholeCandidate === null) {
		return { ok: false, error: "an unsupported code fence wrapped the response" };
	}
	try {
		const parsed = JSON.parse(wholeCandidate) as unknown;
		return isJsonObject(parsed)
			? { ok: true, value: parsed }
			: { ok: false, error: "the JSON value was not an object" };
	} catch {
		// Fall through to narrow balanced-object extraction for surrounding prose.
	}

	const parsedObjects: unknown[] = [];
	for (let index = 0; index < text.length; index += 1) {
		if (text[index] !== "{") continue;
		const objectText = scanJsonObjectAt(text, index);
		if (objectText === null) continue;
		try {
			const parsed = JSON.parse(objectText) as unknown;
			if (isJsonObject(parsed)) parsedObjects.push(parsed);
		} catch {
			// A balanced but malformed candidate is not a parseable findings object.
		}
		index += objectText.length - 1;
	}
	if (parsedObjects.length === 1) return { ok: true, value: parsedObjects[0] };
	if (parsedObjects.length > 1) return { ok: false, error: "multiple JSON objects were present" };
	return { ok: false, error: "no parseable JSON object was present" };
}

function unwrapJsonFence(text: string): string | null {
	const fenced = /^```([^\n`]*)\n?([\s\S]*?)\s*```$/iu.exec(text);
	if (fenced === null) return text;
	const language = fenced[1]?.trim().toLowerCase() ?? "";
	if (language !== "" && language !== "json" && language !== "jsonc") return null;
	return fenced[2] ?? "";
}

function scanJsonObjectAt(text: string, start: number): string | null {
	const stack: string[] = [];
	let isInString = false;
	let isEscaped = false;
	for (let index = start; index < text.length; index += 1) {
		const char = text[index];
		if (char === undefined) return null;
		if (isInString) {
			if (isEscaped) {
				isEscaped = false;
				continue;
			}
			if (char === "\\") {
				isEscaped = true;
				continue;
			}
			if (char === '"') isInString = false;
			continue;
		}
		if (char === '"') {
			isInString = true;
			continue;
		}
		if (char === "{" || char === "[") {
			stack.push(char);
			continue;
		}
		if (char === "}" || char === "]") {
			const opener = stack.pop();
			if (opener === undefined || !isMatchingJsonDelimiter(opener, char)) return null;
			if (stack.length === 0) return text.slice(start, index + 1);
		}
	}
	return null;
}

function isMatchingJsonDelimiter(opener: string, closer: string): boolean {
	return (opener === "{" && closer === "}") || (opener === "[" && closer === "]");
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function piExecutionMessage(result: ExecResult): string {
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
			return "Pi execution was cancelled.";
		case "timed-out":
			return "Pi execution timed out.";
		case "exited":
			return result.signal === null
				? `Pi exited with status ${result.code}.`
				: `Pi exited after signal ${result.signal} (status ${result.code ?? "unknown"}).`;
	}
}
