import { describe, expect, test } from "vitest";

import { renderPromptTemplate } from "../../src/core/download-feedback-prompts.ts";

describe("download feedback prompt templates", () => {
	test("renders named markdown partial placeholders", () => {
		expect(
			renderPromptTemplate("before {{first}} middle {{second}} after {{first}}", {
				first: "one",
				second: "two",
			}),
		).toBe("before one middle two after one");
	});
});
