import { describe, expect, test } from "vitest";

import {
	DEFAULT_FAST_MODEL_REF,
	inferModelProviderFamily,
	isClaudeCodeSupportedModelPattern,
	modelIdFromModelPattern,
	parseModelRef,
	providerMatchesModelProviderFamily,
	resolveModelRef,
} from "../src/primitives/model-slug.ts";

const ENV_VAR = "JI_TEST_MODEL";

describe("parseModelRef", () => {
	test("splits provider and modelId on the first slash", () => {
		expect(parseModelRef("openai-codex/gpt-5.4-mini")).toEqual({
			provider: "openai-codex",
			modelId: "gpt-5.4-mini",
		});
	});

	test("keeps later slashes inside the modelId", () => {
		expect(parseModelRef("bedrock/anthropic/claude")).toEqual({
			provider: "bedrock",
			modelId: "anthropic/claude",
		});
	});

	test("rejects refs without a separator or with edge separators", () => {
		expect(parseModelRef("gpt-5.4-mini")).toBeUndefined();
		expect(parseModelRef("/gpt-5.4-mini")).toBeUndefined();
		expect(parseModelRef("openai-codex/")).toBeUndefined();
		expect(parseModelRef("")).toBeUndefined();
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

describe("resolveModelRef", () => {
	test("falls back to the default when the env var is unset", () => {
		const result = resolveModelRef({}, ENV_VAR, DEFAULT_FAST_MODEL_REF);
		expect(result).toEqual({
			ok: true,
			value: { provider: "openai-codex", modelId: "gpt-5.4-mini" },
		});
	});

	test("uses a trimmed env override", () => {
		const result = resolveModelRef(
			{ [ENV_VAR]: "  acme/fast-1  " },
			ENV_VAR,
			DEFAULT_FAST_MODEL_REF,
		);
		expect(result).toEqual({ ok: true, value: { provider: "acme", modelId: "fast-1" } });
	});

	test("falls back to the default for empty or whitespace env values", () => {
		for (const value of ["", "   "]) {
			const result = resolveModelRef({ [ENV_VAR]: value }, ENV_VAR, DEFAULT_FAST_MODEL_REF);
			expect(result).toEqual({
				ok: true,
				value: { provider: "openai-codex", modelId: "gpt-5.4-mini" },
			});
		}
	});

	test("reports an error naming the env var for an invalid override", () => {
		const result = resolveModelRef({ [ENV_VAR]: "not-a-ref" }, ENV_VAR, DEFAULT_FAST_MODEL_REF);
		expect(result).toEqual({
			ok: false,
			error: `Invalid ${ENV_VAR}="not-a-ref". Expected "provider/modelId".`,
		});
	});
});
