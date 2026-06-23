import { formatZodError } from "@sdl/core/primitives";
import { z } from "zod";

import { isRecord } from "./cmux/primitives.ts";
import { parseMachineEnvelopeData } from "./machine-envelope.ts";

export interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed?: boolean;
}

export interface ExecOptions {
	cwd?: string;
	timeout?: number;
	signal?: AbortSignal;
}

export interface ExecGateway {
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}

export interface PrAddressRunner {
	command: string;
	baseArgs: string[];
}

const nullableIntSchema = z.number().int().nullable();
const nullableStringSchema = z.string().nullable();

const prFeedbackDownloadTargetSchema = z.looseObject({
	kind: z.literal("github_pr"),
	pr_number: nullableIntSchema,
	branch: nullableStringSchema,
	title: nullableStringSchema,
	url: nullableStringSchema,
	head_ref_name: nullableStringSchema,
	base_ref_name: nullableStringSchema,
});

const prFeedbackDownloadCountsSchema = z.looseObject({
	included_review_threads: z.number().int().nonnegative(),
	included_reviews: z.number().int().nonnegative(),
	included_discussion_comments: z.number().int().nonnegative(),
	excluded_resolved_threads: z.number().int().nonnegative(),
	excluded_empty_reviews: z.number().int().nonnegative(),
	excluded_automation_comments: z.number().int().nonnegative(),
});

export const prFeedbackDownloadDataSchema = z.looseObject({
	found: z.boolean(),
	target: prFeedbackDownloadTargetSchema,
	counts: prFeedbackDownloadCountsSchema,
	markdown: z.string(),
});

export type PrFeedbackDownloadData = z.output<typeof prFeedbackDownloadDataSchema>;

export type PrFeedbackDownloadParseResult =
	| { type: "valid"; data: PrFeedbackDownloadData }
	| { type: "invalid"; message: string };

export type DownloadPrFeedbackResult =
	| { type: "ok"; data: PrFeedbackDownloadData; exitCode: number }
	| { type: "error"; message: string };

export interface DownloadPrFeedbackOptions {
	pi: ExecGateway;
	cwd: string;
	prNumber?: number | undefined;
	timeoutMs: number;
	signal?: AbortSignal | undefined;
	runner?: PrAddressRunner | undefined;
	shouldAllowFailureData?: boolean | undefined;
}

export function parseDownloadFeedbackData(value: unknown): PrFeedbackDownloadParseResult {
	const parsed = prFeedbackDownloadDataSchema.safeParse(value);
	if (!parsed.success) {
		return {
			type: "invalid",
			message: `download-feedback data did not match expected schema: ${formatZodError(parsed.error)}`,
		};
	}
	return { type: "valid", data: parsed.data };
}

export async function downloadPrFeedback(
	options: DownloadPrFeedbackOptions,
): Promise<DownloadPrFeedbackResult> {
	const runner = options.runner ?? { command: "pr-address", baseArgs: [] };
	const result = await options.pi.exec(
		runner.command,
		[
			...runner.baseArgs,
			"exec",
			"download-feedback",
			...(options.prNumber === undefined ? [] : ["--pr-number", String(options.prNumber)]),
			"--format",
			"json",
		],
		{
			cwd: options.cwd,
			timeout: options.timeoutMs,
			...(options.signal === undefined ? {} : { signal: options.signal }),
		},
	);
	if (result.killed) {
		return { type: "error", message: "download-feedback timed out." };
	}
	if (result.code !== 0 && options.shouldAllowFailureData !== true) {
		return {
			type: "error",
			message: `download-feedback failed: ${result.stderr.trim() || `exit code ${result.code}`}`,
		};
	}

	const envelopeData = parseDownloadFeedbackEnvelopeData(
		result,
		options.shouldAllowFailureData === true,
	);
	if (envelopeData.type === "error") return envelopeData;
	const parsedData = parseDownloadFeedbackData(envelopeData.data);
	if (parsedData.type === "invalid") return { type: "error", message: parsedData.message };
	return { type: "ok", data: parsedData.data, exitCode: result.code };
}

function parseDownloadFeedbackEnvelopeData(
	result: ExecResult,
	shouldAllowFailureData: boolean,
): { type: "ok"; data: unknown } | { type: "error"; message: string } {
	const parsed = parseMachineEnvelopeData(result.stdout, {
		label: "pr-address download-feedback JSON",
		stdoutTail: { maxChars: 1_000 },
	});
	if (parsed.type === "valid") return { type: "ok", data: parsed.data };
	if (shouldAllowFailureData) {
		const failureData = failureEnvelopeData(result.stdout);
		if (failureData !== undefined) return { type: "ok", data: failureData };
	}
	return { type: "error", message: parsed.message };
}

function failureEnvelopeData(stdout: string): Record<string, unknown> | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		// Malformed JSON means stdout is not a Clinkr failure envelope; report the original parse error.
		return undefined;
	}
	if (!isRecord(parsed) || parsed.exit_code !== 1 || !isRecord(parsed.data)) return undefined;
	return parsed.data;
}
