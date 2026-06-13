import { describe, expect, test } from "vitest";

import {
	CHECKPOINT_SUBJECT_MAX_LENGTH,
	formatCheckpointMessage,
	formatCheckpointValidationFeedback,
	validateCheckpointMessage,
	type CheckpointMessageIssue,
} from "../../src/checkpoint-message.ts";

const validOneBullet = `[cp] Update checkpoint tests

- Add validator coverage`;
const validThreeBullets = `[cp] Update checkpoint tests

- Add validator coverage
- Exercise repair feedback
- Verify model-only failures`;

function issueCodes(issues: CheckpointMessageIssue[]): string[] {
	return issues.map((issue) => issue.code);
}

describe("validateCheckpointMessage", () => {
	test("accepts a minimal valid message with one bullet", () => {
		const result = validateCheckpointMessage(validOneBullet);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.message.subject).toBe("[cp] Update checkpoint tests");
			expect(result.message.bullets).toEqual(["- Add validator coverage"]);
			expect(formatCheckpointMessage(result.message)).toBe(validOneBullet);
		}
	});

	test("accepts a valid message with three bullets", () => {
		const result = validateCheckpointMessage(validThreeBullets);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.message.bullets).toHaveLength(3);
		}
	});

	test("rejects the four-bullet regression without blaming subject length", () => {
		const result = validateCheckpointMessage(`[cp] Resolve vibecoded pi-coding-agent import drift

- Update pi-extension-deepening objective/roadmap candidate 10 disposition
- Switch .pi/extensions land/submit imports to @earendil-works
- Refresh docs/pi README vibecoded vs promotion statuses
- Add .asdl/objectives/pi-extension-deepening/updates/2026-05-25-vibecoded-extension-dispositions.md`);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			const codes = issueCodes(result.issues);
			expect(codes).toContain("too_many_bullets");
			expect(codes).not.toContain("subject_too_long");
			expect(result.issues).toContainEqual({ code: "too_many_bullets", count: 4, maxCount: 3 });
		}
	});

	test("rejects a subject longer than 52 characters", () => {
		const subject = `[cp] ${"a".repeat(CHECKPOINT_SUBJECT_MAX_LENGTH - "[cp] ".length + 1)}`;
		const result = validateCheckpointMessage(`${subject}

- Add coverage`);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues).toContainEqual({
				code: "subject_too_long",
				length: subject.length,
				maxLength: CHECKPOINT_SUBJECT_MAX_LENGTH,
				subject,
			});
		}
	});

	test("reports a missing cp prefix deterministically", () => {
		const result = validateCheckpointMessage(`Update checkpoint tests

- Add coverage`);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues).toContainEqual({ code: "missing_cp_prefix", subject: "Update checkpoint tests" });
		}
	});

	test("reports a trailing subject period deterministically", () => {
		const result = validateCheckpointMessage(`[cp] Update checkpoint tests.

- Add coverage`);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues).toContainEqual({ code: "subject_trailing_period", subject: "[cp] Update checkpoint tests." });
		}
	});

	test("strips an outer code fence from an otherwise valid response", () => {
		const fenced = "```gitcommit\n" + validOneBullet + "\n```";
		const result = validateCheckpointMessage(fenced);

		expect(result.ok).toBe(true);
	});

	test("rejects commit trailers", () => {
		const result = validateCheckpointMessage(`${validOneBullet}
Co-Authored-By: Agent <agent@example.com>`);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(issueCodes(result.issues)).toContain("trailer");
		}
	});

	test("rejects extra prose before or after the checkpoint message", () => {
		const result = validateCheckpointMessage(`Here is the message:
${validOneBullet}
Thanks!`);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(issueCodes(result.issues)).toContain("extra_prose");
		}
	});

	test("formats projected validation issues as repair feedback", () => {
		const result = validateCheckpointMessage(`[cp] Update checkpoint tests.
-Missing blank separator`);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			const feedback = formatCheckpointValidationFeedback(result.issues);
			expect(feedback).toContain("subject_trailing_period");
			expect(feedback).toContain("missing_blank_line");
			expect(feedback).toContain("line 2 must start with");
		}
	});
});
