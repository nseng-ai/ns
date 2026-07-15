import { describe, expect, test } from "vitest";

import {
	CLAUDE_CLI_MODEL,
	resolveClaudeCliDraftModel,
	resolveCodexDraftModel,
} from "../src/kit/shared/fast-text-draft.ts";

describe("resolveCodexDraftModel", () => {
	test("accepts an explicit resolved provider/model reference", () => {
		const resolved = resolveCodexDraftModel("acme/fast-1");
		expect(resolved.provider).toBe("acme");
		expect(resolved.modelId).toBe("fast-1");
	});

	test("rejects an unresolved model reference", () => {
		expect(() => resolveCodexDraftModel("")).toThrow("Invalid resolved Pi draft model reference");
	});
});

describe("resolveClaudeCliDraftModel", () => {
	test("uses Claude's built-in model", () => {
		expect(resolveClaudeCliDraftModel()).toBe(CLAUDE_CLI_MODEL);
	});
});
