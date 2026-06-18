import { describe, expect, test } from "vitest";

import { isLowercaseKebabCaseToken } from "@sdl/core/text-identifiers";

describe("isLowercaseKebabCaseToken", () => {
	test.each(["follow-up", "a", "abc123", "a1-b2"])("accepts %j", (value) => {
		expect(isLowercaseKebabCaseToken(value)).toBe(true);
	});

	test.each(["", "Follow-Up", "follow_up", "follow up", "follow--up", "-follow-up", "follow-up-", "follow/up"])("rejects %j", (value) => {
		expect(isLowercaseKebabCaseToken(value)).toBe(false);
	});
});
