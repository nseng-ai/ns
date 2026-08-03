import { describe, expect, test } from "vitest";

import { parseArgs } from "../../src/land/land-stack.ts";
import { approvedLandConfirmationKinds } from "../../src/land/landing-confirmation-policy.ts";
import type { ParsedArgs } from "../../src/land/stack/types.ts";

function expectParsed(argsText: string): ParsedArgs {
	const result = parseArgs(argsText);
	if (result.type === "failure") throw new Error(result.failure.message);
	return result.value;
}

describe("canonical confirmation approval mapping", () => {
	test("--yes approves main landing kinds but leaves pre-merge prompts canonical", () => {
		expect([...approvedLandConfirmationKinds({ flags: expectParsed("--yes") })]).toEqual([
			"main-landing",
			"single-branch-main-landing",
		]);
	});

	test("--free grants no confirmation kinds; the flag is cleanup consent, not approval", () => {
		expect(approvedLandConfirmationKinds({ flags: expectParsed("--free") })).toEqual(new Set());
	});

	test("interactive and dry-run calls grant no request kinds", () => {
		expect(approvedLandConfirmationKinds({ flags: expectParsed("") })).toEqual(new Set());
		expect(
			approvedLandConfirmationKinds({ flags: expectParsed("--dry-run --yes --free") }),
		).toEqual(new Set());
	});
});
