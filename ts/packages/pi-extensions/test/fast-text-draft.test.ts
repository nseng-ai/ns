import { describe, expect, test } from "vitest";

import { DEFAULT_FAST_MODEL } from "@asdl/plans";
import {
	CLAUDE_CLI_MODEL,
	DRAFT_MODEL_ENV,
	resolveClaudeCliDraftModel,
	resolveCodexDraftModel,
} from "../src/fast-text-draft.ts";

describe("resolveCodexDraftModel", () => {
	test("uses the shared fast-model default when the env var is unset", () => {
		const resolved = resolveCodexDraftModel({});
		expect(resolved.warning).toBeUndefined();
		expect(resolved.value.provider).toBe(DEFAULT_FAST_MODEL.provider);
		expect(resolved.value.modelId).toBe(DEFAULT_FAST_MODEL.modelId);
	});

	test("accepts a full provider/modelId override", () => {
		const resolved = resolveCodexDraftModel({ [DRAFT_MODEL_ENV]: "acme/fast-1" });
		expect(resolved.warning).toBeUndefined();
		expect(resolved.value.provider).toBe("acme");
		expect(resolved.value.modelId).toBe("fast-1");
		expect(resolved.value.label).toBe("acme/fast-1");
	});

	test("warns and falls back for a bare modelId override", () => {
		const resolved = resolveCodexDraftModel({ [DRAFT_MODEL_ENV]: "fast-1" });
		expect(resolved.warning).toContain(DRAFT_MODEL_ENV);
		expect(resolved.warning).toContain('"fast-1"');
		expect(resolved.value.provider).toBe(DEFAULT_FAST_MODEL.provider);
		expect(resolved.value.modelId).toBe(DEFAULT_FAST_MODEL.modelId);
	});

	test("warns and falls back to the default for an invalid override", () => {
		const resolved = resolveCodexDraftModel({ [DRAFT_MODEL_ENV]: "acme/" });
		expect(resolved.warning).toContain(DRAFT_MODEL_ENV);
		expect(resolved.warning).toContain('"acme/"');
		expect(resolved.value.provider).toBe(DEFAULT_FAST_MODEL.provider);
		expect(resolved.value.modelId).toBe(DEFAULT_FAST_MODEL.modelId);
	});

	test("treats empty and whitespace values as unset", () => {
		for (const value of ["", "   "]) {
			const resolved = resolveCodexDraftModel({ [DRAFT_MODEL_ENV]: value });
			expect(resolved.warning).toBeUndefined();
			expect(resolved.value.modelId).toBe(DEFAULT_FAST_MODEL.modelId);
		}
	});
});

describe("resolveClaudeCliDraftModel", () => {
	test("defaults to the named Claude CLI model", () => {
		expect(resolveClaudeCliDraftModel({})).toBe(CLAUDE_CLI_MODEL);
	});

	test("uses a trimmed override verbatim", () => {
		expect(resolveClaudeCliDraftModel({ [DRAFT_MODEL_ENV]: "  claude-sonnet-4-6  " })).toBe(
			"claude-sonnet-4-6",
		);
	});
});
