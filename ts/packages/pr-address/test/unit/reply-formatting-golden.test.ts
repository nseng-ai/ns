import { describe, expect, test } from "vitest";

import { formatDiscussionReply, formatResolutionReply, formatReviewReply } from "../../src/reply-formatting.ts";
import type { ResolutionProvenance } from "../../src/reply-formatting.ts";
import { goldenCases, readJson } from "../support/golden.ts";

const FIXED_REPLY_TIMESTAMP = "2026-06-01T12:34:56Z";

const replyFormattingCases = await goldenCases("reply-formatting");

function formatGoldenReply(input: unknown): string {
	if (!isRecord(input)) throw new Error("golden input must be an object");
	const functionName = input.function;
	const kwargs = input.kwargs;
	if (typeof functionName !== "string" || !isRecord(kwargs)) throw new Error("golden input missing function/kwargs");
	if (functionName === "resolution_reply") {
		return formatResolutionReply({
			mode: resolutionMode(kwargs.mode),
			message: nullableString(kwargs.message),
			commitSha: nullableString(kwargs.commit_sha),
			provenance: provenanceField(kwargs.provenance),
			timestamp: FIXED_REPLY_TIMESTAMP,
		});
	}
	if (functionName === "review_reply") {
		return formatReviewReply({ reviewAuthor: stringField(kwargs.review_author), summaryMarkdown: stringField(kwargs.summary_markdown), timestamp: FIXED_REPLY_TIMESTAMP });
	}
	if (functionName === "discussion_reply") {
		return formatDiscussionReply({ commentAuthor: stringField(kwargs.comment_author), originalBody: stringField(kwargs.original_body), response: stringField(kwargs.response), timestamp: FIXED_REPLY_TIMESTAMP });
	}
	throw new Error(`Unsupported reply formatting function: ${functionName}`);
}

describe("reply formatting TypeScript parity", () => {
	for (const goldenCase of replyFormattingCases) {
		test(`matches golden ${goldenCase.name}`, async () => {
			const input = await readJson(goldenCase.inputPath);
			const expected = await readJson(goldenCase.expectedPath);

			expect(formatGoldenReply(input)).toEqual(expected);
		});
	}
});

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string {
	if (typeof value !== "string") throw new Error("expected string field");
	return value;
}

function nullableString(value: unknown): string | null {
	if (value === null) return null;
	return stringField(value);
}

function nullableOptionalString(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	return stringField(value);
}

function provenanceField(value: unknown): ResolutionProvenance | null {
	if (value === null || value === undefined) return null;
	if (!isRecord(value)) throw new Error("expected provenance object");
	if (value.kind === "local_branch") {
		return { kind: "local_branch", branch: stringField(value.branch), branch_head_oid: stringField(value.branch_head_oid) };
	}
	if (value.kind === "pr") {
		const prNumber = value.pr_number;
		if (typeof prNumber !== "number") throw new Error("expected pr_number");
		return {
			kind: "pr",
			pr_number: prNumber,
			pr_url: stringField(value.pr_url),
			pr_state: stringField(value.pr_state),
			pr_head_ref_name: stringField(value.pr_head_ref_name),
			pr_head_ref_oid: nullableOptionalString(value.pr_head_ref_oid),
		};
	}
	throw new Error("expected provenance kind");
}

function resolutionMode(value: unknown) {
	if (value === "fixed" || value === "pre_existing" || value === "explained" || value === "planned") return value;
	throw new Error("expected resolution mode");
}
