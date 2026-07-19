import { describe, expect, test } from "vitest";

import {
	DEFAULT_FAST_MODEL,
	formatModelRef,
	inferModelProviderFamily,
	isClaudeCodeSupportedModelPattern,
	modelIdFromModelPattern,
	modelSelectionSchema,
	modelThinkingSchema,
	parseModelRef,
	providerMatchesModelProviderFamily,
} from "../src/primitives/model-slug.ts";

describe("model selection schemas", () => {
	test("accepts the complete thinking vocabulary", () => {
		expect(
			["off", "minimal", "low", "medium", "high", "xhigh"].map((value) =>
				modelThinkingSchema.parse(value),
			),
		).toEqual(["off", "minimal", "low", "medium", "high", "xhigh"]);
	});

	test("requires thinking on model selections", () => {
		expect(
			modelSelectionSchema.safeParse({ provider: "openai-codex", modelId: "gpt-5.6-luna" }).success,
		).toBe(false);
	});
});

describe("parseModelRef", () => {
	test("splits provider and modelId on the first slash with explicit thinking", () => {
		expect(parseModelRef("openai-codex/gpt-5.4-mini", "low")).toEqual({
			provider: "openai-codex",
			modelId: "gpt-5.4-mini",
			thinking: "low",
		});
	});

	test("keeps later slashes inside the modelId", () => {
		expect(parseModelRef("bedrock/anthropic/claude", "high")).toEqual({
			provider: "bedrock",
			modelId: "anthropic/claude",
			thinking: "high",
		});
	});

	test("formats selections and round trips qualified references", () => {
		const selection = parseModelRef("bedrock/anthropic/claude", "minimal");
		expect(selection).toBeDefined();
		if (selection !== undefined) {
			expect(formatModelRef(selection)).toBe("bedrock/anthropic/claude");
		}
	});

	test("configures minimal thinking for the default selection", () => {
		expect(DEFAULT_FAST_MODEL.thinking).toBe("minimal");
	});

	test("rejects refs without a separator or with edge separators", () => {
		expect(parseModelRef("gpt-5.4-mini", "minimal")).toBeUndefined();
		expect(parseModelRef("/gpt-5.4-mini", "minimal")).toBeUndefined();
		expect(parseModelRef("openai-codex/", "minimal")).toBeUndefined();
		expect(parseModelRef("", "minimal")).toBeUndefined();
	});
});

describe("model provider families", () => {
	test("normalizes model patterns before family inference", () => {
		expect(modelIdFromModelPattern("  GPT-5.4-mini:medium  ")).toBe("gpt-5.4-mini");
	});

	test.each([
		["sonnet", "anthropic"],
		["fable", "anthropic"],
		["claude-3-5-sonnet", "anthropic"],
		["gemini-2.5-flash", "google"],
		["gpt-5.4-mini:medium", "openai"],
		["o1-preview", "openai"],
		["openai-codex/custom-mini", "openai"],
		["google/custom-model", "google"],
	] as const)("infers %s as %s", (modelPattern, family) => {
		expect(inferModelProviderFamily(modelPattern)).toBe(family);
	});

	test("returns undefined for unknown model patterns", () => {
		expect(inferModelProviderFamily("llama-3")).toBeUndefined();
		expect(inferModelProviderFamily("   ")).toBeUndefined();
	});

	test("matches provider aliases against families", () => {
		expect(providerMatchesModelProviderFamily("anthropic", "anthropic")).toBe(true);
		expect(providerMatchesModelProviderFamily("gemini", "google")).toBe(true);
		expect(providerMatchesModelProviderFamily("openai-codex", "openai")).toBe(true);
		expect(providerMatchesModelProviderFamily("anthropic", "openai")).toBe(false);
	});

	test("keeps Claude Code harness shorthand support narrower than Anthropic family inference", () => {
		expect(isClaudeCodeSupportedModelPattern("sonnet")).toBe(true);
		expect(isClaudeCodeSupportedModelPattern("claude-3-5-sonnet")).toBe(true);
		expect(isClaudeCodeSupportedModelPattern("SONNET")).toBe(false);
		expect(isClaudeCodeSupportedModelPattern("fable")).toBe(false);
		expect(isClaudeCodeSupportedModelPattern("gpt-4")).toBe(false);
	});
});
