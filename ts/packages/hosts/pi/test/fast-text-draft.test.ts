import { describe, expect, test } from "vitest";

import { DEFAULT_FAST_MODEL } from "@nseng-ai/foundation/model-slug";
import {
	CLAUDE_CLI_MODEL,
	resolveClaudeCliDraftModel,
	resolveCodexDraftModel,
} from "../src/kit/shared/fast-text-draft.ts";

describe("resolveCodexDraftModel", () => {
	test("uses the shared fast-model default when no policy model is supplied", () => {
		const resolved = resolveCodexDraftModel();
		expect(resolved.provider).toBe(DEFAULT_FAST_MODEL.provider);
		expect(resolved.modelId).toBe(DEFAULT_FAST_MODEL.modelId);
	});

	test("accepts an explicit resolved provider/model reference", () => {
		const resolved = resolveCodexDraftModel("acme/fast-1");
		expect(resolved.provider).toBe("acme");
		expect(resolved.modelId).toBe("fast-1");
	});

	test("does not select a model from the removed environment variable", () => {
		expect(resolveCodexDraftModel().modelId).toBe(DEFAULT_FAST_MODEL.modelId);
	});
});

describe("resolveClaudeCliDraftModel", () => {
	test("uses Claude's built-in model", () => {
		expect(resolveClaudeCliDraftModel()).toBe(CLAUDE_CLI_MODEL);
	});
});
