import { describe, expect, test, vi } from "vitest";

import {
	CLAUDE_CLI_MODEL,
	resolveClaudeCliDraftModel,
	resolveCodexDraftModel,
	selectDraftHarness,
} from "../src/kit/shared/fast-text-draft.ts";

describe("resolveCodexDraftModel", () => {
	test("accepts an explicit resolved provider/model reference", () => {
		const resolved = resolveCodexDraftModel({
			provider: "acme",
			modelId: "fast-1",
			thinking: "low",
		});
		expect(resolved.modelSelection).toEqual({
			provider: "acme",
			modelId: "fast-1",
			thinking: "low",
		});
	});

	test("rejects an unresolved model reference", () => {
		expect(() =>
			resolveCodexDraftModel({ provider: "", modelId: "", thinking: "minimal" }),
		).toThrow("Invalid resolved Pi draft model reference");
	});

	test("uses the explicit resolved reference despite ambient draft model configuration", () => {
		vi.stubEnv("PI_DRAFT_MODEL", "ambient/wrong-model");
		expect(
			resolveCodexDraftModel({ provider: "acme", modelId: "explicit-model", thinking: "minimal" }),
		).toMatchObject({
			modelSelection: { provider: "acme", modelId: "explicit-model", thinking: "minimal" },
		});
	});
});

describe("selectDraftHarness", () => {
	test("keeps PI_DRAFT_HARNESS as the harness selector", () => {
		vi.stubEnv("PI_DRAFT_HARNESS", "claude-cli");
		expect(selectDraftHarness()).toEqual({ value: "claude-cli" });
	});
});

describe("resolveClaudeCliDraftModel", () => {
	test("uses Claude's built-in model", () => {
		expect(resolveClaudeCliDraftModel()).toBe(CLAUDE_CLI_MODEL);
	});
});
