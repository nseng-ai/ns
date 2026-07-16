import {
	commandSucceeded,
	type CommandExecApi,
	type CommandResolver,
	type ExecResult,
} from "@nseng-ai/foundation/command";
import { defaultCommandResolver } from "@nseng-ai/foundation/exec";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";

import {
	resolveHarnessBinary,
	structuredOutputExecOptions,
	transportFailure,
	type PiStructuredOutputRequest,
	type StructuredOutputRunOptions,
	type StructuredOutputTransportOutcome,
} from "./structured-output-transport.ts";

export const PI_BINARY = "pi";

export interface PiStructuredOutputTransportOptions {
	readonly execApi: CommandExecApi;
	readonly binaryResolver?: CommandResolver;
}

export class PiStructuredOutputTransport {
	private readonly execApi: CommandExecApi;
	private readonly binaryResolver: CommandResolver;

	constructor(options: PiStructuredOutputTransportOptions) {
		this.execApi = options.execApi;
		this.binaryResolver = options.binaryResolver ?? defaultCommandResolver;
	}

	async run(
		request: PiStructuredOutputRequest,
		options: StructuredOutputRunOptions,
	): Promise<StructuredOutputTransportOutcome> {
		const binary = resolveHarnessBinary(this.binaryResolver, PI_BINARY, "Pi");
		if (!binary.ok) return binary;

		let result: ExecResult;
		try {
			result = await this.execApi.exec(
				binary.value,
				buildPiArgs(request),
				structuredOutputExecOptions(options, request.promptText),
			);
		} catch (error) {
			return transportFailure(
				"invocation-failed",
				`Failed to invoke Pi: ${formatErrorMessage(error)}`,
			);
		}

		if (result.type === "spawn-failed") {
			return transportFailure("invocation-failed", result.error);
		}
		if (result.type === "cancelled") {
			return transportFailure("cancelled", piExecutionMessage(result));
		}
		if (!commandSucceeded(result)) {
			return transportFailure("execution-failed", piExecutionMessage(result));
		}
		return parsePiStructuredOutput(result.stdout);
	}
}

export function buildPiArgs(
	request: Pick<PiStructuredOutputRequest, "modelId" | "systemPrompt">,
): string[] {
	return [
		"--provider",
		"vercel-ai-gateway",
		"--model",
		request.modelId,
		"--thinking",
		"minimal",
		"--system-prompt",
		request.systemPrompt,
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

export function parsePiStructuredOutput(output: string): StructuredOutputTransportOutcome {
	const trimmed = output.trim();
	if (trimmed === "") return transportFailure("empty-output", "Pi produced no JSON output.");

	const parsed = parseSingleJsonObject(trimmed);
	if (!parsed.ok) {
		return transportFailure(
			"invalid-json",
			`Pi output was not exactly one valid JSON object: ${parsed.error}`,
		);
	}
	return { ok: true, value: { payload: parsed.value, usage: null } };
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
			// A balanced but malformed candidate is not a parseable object.
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
