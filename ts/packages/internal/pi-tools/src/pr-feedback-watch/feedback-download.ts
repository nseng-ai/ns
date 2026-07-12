import { commandFailureReason, commandSucceeded } from "@nseng-ai/foundation/exec";
import { formatZodError } from "@nseng-ai/foundation/primitives";
import type { ExecResult } from "@nseng-ai/pi/shared/command-exec";
import type { CommandExecApi } from "@nseng-ai/pi/shared/command-exec";
import { z } from "zod";

import { parseMachineEnvelopeDataWithFailureData } from "@nseng-ai/pi/runtime/machine-envelope";

export type { ExecOptions, ExecResult } from "@nseng-ai/pi/shared/command-exec";
export type { CommandExecApi } from "@nseng-ai/pi/shared/command-exec";

export interface PrAddressRunner {
	command: string;
	baseArgs: string[];
}

const nullableIntSchema = z.number().int().nullable();
const nullableStringSchema = z.string().nullable();

const prFeedbackDownloadTargetSchema = z.looseObject({
	kind: z.literal("github-pr"),
	pr_number: nullableIntSchema,
	branch: nullableStringSchema,
	title: nullableStringSchema,
	url: nullableStringSchema,
	head_ref_name: nullableStringSchema,
	base_ref_name: nullableStringSchema,
});

export const prFeedbackDownloadCountsSchema = z.looseObject({
	includedReviewThreads: z.number().int().nonnegative(),
	includedReviews: z.number().int().nonnegative(),
	includedDiscussionComments: z.number().int().nonnegative(),
	excludedResolvedThreads: z.number().int().nonnegative(),
	excludedEmptyReviews: z.number().int().nonnegative(),
	excludedAutomationComments: z.number().int().nonnegative(),
});

export const prFeedbackDownloadDataSchema = z.looseObject({
	found: z.boolean(),
	target: prFeedbackDownloadTargetSchema,
	counts: prFeedbackDownloadCountsSchema,
	markdown: z.string(),
});

export type PrFeedbackDownloadCounts = z.output<typeof prFeedbackDownloadCountsSchema>;
export type PrFeedbackDownloadData = z.output<typeof prFeedbackDownloadDataSchema>;

export type PrFeedbackDownloadParseResult =
	| { type: "valid"; data: PrFeedbackDownloadData }
	| { type: "invalid"; message: string };

export type DownloadPrFeedbackResult =
	| { type: "ok"; data: PrFeedbackDownloadData; exitCode: number }
	| { type: "error"; message: string };

export interface DownloadPrFeedbackOptions {
	pi: CommandExecApi;
	cwd: string;
	prNumber?: number;
	timeoutMs: number;
	signal?: AbortSignal;
	runner?: PrAddressRunner;
	shouldAllowFailureData?: boolean;
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
	if (result.type === "timed-out") {
		return { type: "error", message: "download-feedback timed out." };
	}
	if (result.type === "cancelled") {
		return { type: "error", message: "download-feedback was cancelled." };
	}
	if (result.type === "spawn-failed") {
		return { type: "error", message: `download-feedback failed: ${result.error}` };
	}
	if (result.signal !== null || result.code === null) {
		return { type: "error", message: `download-feedback failed: ${commandFailureReason(result)}` };
	}
	if (!commandSucceeded(result) && options.shouldAllowFailureData !== true) {
		return {
			type: "error",
			message: `download-feedback failed: ${commandFailureReason(result)}`,
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
	const parsed = parseMachineEnvelopeDataWithFailureData(result.stdout, {
		label: "pr-address download-feedback JSON",
		stdoutTail: { maxChars: 1_000 },
		shouldAllowFailureData,
	});
	return parsed.type === "valid"
		? { type: "ok", data: parsed.data }
		: { type: "error", message: parsed.message };
}
